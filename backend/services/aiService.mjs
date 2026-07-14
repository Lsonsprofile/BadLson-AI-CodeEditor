// backend/services/aiService.mjs
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

const geminiClient = GEMINI_API_KEY ? new GoogleGenAI({ apiKey: GEMINI_API_KEY }) : null;

// ─── CONFIG ─────────────────────────────────────────────────────────
const TOKEN_BUDGET = {
  MAX_TOTAL_CHARS: 120000,
  MAX_FILE_CHARS: 10000,
  MAX_FILES: 40,
  TREE_MAX_FILES: 150,
};

const DEFAULT_FREE_MODELS = [
  'google/gemma-4-26b-it:free',
  'google/gemma-4-31b-it:free',
  'nvidia/llama-3.1-nemotron-70b-instruct:free',
  'meta-llama/llama-3.3-70b-instruct:free',
  'deepseek/deepseek-chat:free',
  'mistralai/mistral-small-3.1-24b-instruct:free',
  'qwen/qwen-2.5-72b-instruct:free',
];

let cachedFreeModels = null;
let lastModelFetch = 0;
const MODEL_CACHE_TTL_MS = 1000 * 60 * 30;

// ─── SYSTEM PROMPTS BY MODE ────────────────────────────────────────

const BASE_SYSTEM = `You are a Senior Full-Stack Developer working inside BadLson AI Code Editor.

TECH STACK: JavaScript ES6+, TypeScript, React, HTML5, CSS/Tailwind, Node.js, Express.

ABSOLUTE RULES — VIOLATING THESE CORRUPTS USER FILES:
1. ONLY use \`\`\`edit:FULL_FILE_PATH blocks for code changes
2. NEVER output raw suggestions as /* AI SUGGESTION... */ comments
3. NEVER output "Copy" or "Apply" buttons or labels
4. NEVER append text to files outside of edit blocks
5. If you cannot determine the exact change, ASK the user instead of guessing
6. Work on ONE file at a time per response
7. After completing a file, say: **File Completed:** filename
8. If you need more info (error logs, file content), ASK for it
9. Explain your reasoning BEFORE showing code changes`;

const MODE_PROMPTS = {
  code: `${BASE_SYSTEM}

MODE: CODE GENERATION
You are writing new code or modifying existing code.
- Provide complete, working, production-ready code inside edit blocks ONLY
- Follow best practices: error handling, type safety, performance
- If the request is vague, ask clarifying questions first`,

  debug: `${BASE_SYSTEM}

MODE: DEBUGGING
You are helping fix a bug or error.
1. First, explain what you think is causing the issue
2. Then provide the fix using \`\`\`edit:path format ONLY
3. Explain why the fix works
4. Suggest how to prevent similar issues

If you need:
- Error messages → ask for them
- Console logs → ask for them
- Specific file content → ask for it`,

  review: `${BASE_SYSTEM}

MODE: CODE REVIEW
You are reviewing code for quality.
Analyze and report on:
1. Bugs and logic errors
2. Security vulnerabilities (XSS, injection, auth issues)
3. Performance problems (unnecessary re-renders, O(n²) loops)
4. Maintainability (naming, structure, comments)
5. TypeScript type safety issues

For each issue:
- Explain the problem
- Show the corrected code with \`\`\`edit:path ONLY
- Explain why it's better`,

  explain: `${BASE_SYSTEM}

MODE: EXPLANATION
You are explaining code or concepts.
- Break complex topics into simple steps
- Use the actual code from the project as examples
- Explain common mistakes related to this topic
- Suggest best practices
- NO edit blocks needed unless the user asks for code changes`,

  design: `${BASE_SYSTEM}

MODE: ARCHITECTURE/DESIGN
You are helping design software structure.
- Consider scalability, maintainability, security
- Explain tradeoffs between approaches
- Suggest folder structure and file organization
- Do NOT write full implementation unless asked`,

  error: `${BASE_SYSTEM}

MODE: ERROR RESPONSE
The user's code has errors. Help them fix it.

ERROR INFORMATION is provided below. Use it to diagnose.

Steps:
1. Identify the root cause from the error
2. Explain what's wrong
3. Provide the fix with \`\`\`edit:path ONLY
4. Verify the fix handles edge cases`,

  generic: BASE_SYSTEM,
};

// ─── MODE DETECTION ────────────────────────────────────────────────

function detectMode(userMessage, context = {}) {
  const msg = userMessage.toLowerCase();
  
  if (context.consoleErrors?.length || context.buildErrors?.length) return 'error';
  if (msg.includes('review') || msg.includes('check this code') || msg.includes('what do you think')) return 'review';
  if (msg.includes('explain') || msg.includes('how does') || msg.includes('what is') || msg.includes('why does')) return 'explain';
  if (msg.includes('design') || msg.includes('architecture') || msg.includes('structure') || msg.includes('folder')) return 'design';
  if (msg.includes('fix') || msg.includes('bug') || msg.includes('error') || msg.includes('broken') || msg.includes('not working')) return 'debug';
  if (msg.includes('add') || msg.includes('create') || msg.includes('write') || msg.includes('implement') || msg.includes('change') || msg.includes('update') || msg.includes('refactor')) return 'code';
  
  return 'generic';
}

// ─── SMART FILE SELECTION ─────────────────────────────────────────

export function selectRelevantFiles(projectFiles, userMessage, activeFile = null, recentFiles = []) {
  const entries = Object.entries(projectFiles);
  const totalFiles = entries.length;
  
  if (totalFiles === 0) return {};
  if (totalFiles <= TOKEN_BUDGET.MAX_FILES) {
    return Object.fromEntries(entries.map(([name, content]) => [name, truncateContent(content)]));
  }

  const msgLower = userMessage.toLowerCase();
  const msgWords = new Set(msgLower.split(/\W+/).filter(w => w.length > 2));
  
  const importMap = buildImportMap(entries);
  
  const scoredFiles = entries.map(([filename, content]) => {
    let score = 0;
    const fileLower = filename.toLowerCase();
    const contentLower = content.toLowerCase();
    const contentWords = contentLower.split(/\W+/).filter(w => w.length > 2);
    const contentWordSet = new Set(contentWords);
    
    if (activeFile && (filename === activeFile || fileLower.includes(activeFile.toLowerCase()))) {
      score += 2000;
    }
    
    if (recentFiles.includes(filename)) score += 500;
    
    if (activeFile && importMap[activeFile]?.includes(filename)) score += 400;
    if (activeFile && importMap[filename]?.includes(activeFile)) score += 300;
    
    for (const word of msgWords) {
      if (fileLower.includes(word)) score += 60;
    }
    
    let contentMatches = 0;
    for (const word of msgWords) {
      if (contentWordSet.has(word)) contentMatches++;
    }
    score += contentMatches * 15;
    
    const sizeBonus = Math.max(0, 8000 - content.length) / 150;
    score += sizeBonus;
    
    const entryPoints = ['index.html', 'index.js', 'app.js', 'main.js', 'main.ts', 'app.tsx', 'main.tsx'];
    if (entryPoints.some(ep => filename === ep || filename.endsWith('/' + ep))) score += 40;
    
    if (filename.includes('package.json') || filename.includes('.gitignore') || 
        filename.includes('README') || filename.includes('node_modules') ||
        filename.includes('vite.config') || filename.includes('tsconfig')) {
      score -= 60;
    }
    
    return { filename, content, score };
  });

  scoredFiles.sort((a, b) => b.score - a.score);
  const selected = scoredFiles.slice(0, TOKEN_BUDGET.MAX_FILES);
  
  if (activeFile && projectFiles[activeFile] && !selected.find(f => f.filename === activeFile)) {
    selected.pop();
    selected.push({ filename: activeFile, content: projectFiles[activeFile], score: 9999 });
  }
  
  if (projectFiles['index.html'] && !selected.find(f => f.filename === 'index.html')) {
    const idx = scoredFiles.find(f => f.filename === 'index.html');
    if (idx) { selected.pop(); selected.push(idx); }
  }

  return Object.fromEntries(selected.map(({ filename, content }) => [filename, truncateContent(content)]));
}

function buildImportMap(entries) {
  const map = {};
  const importRegex = /(?:import|require)\s*\(?['"]([^'"]+)['"]\)?/g;
  
  for (const [filename, content] of entries) {
    map[filename] = [];
    let match;
    while ((match = importRegex.exec(content)) !== null) {
      const importPath = match[1];
      if (importPath.startsWith('.')) {
        const dir = filename.includes('/') ? filename.substring(0, filename.lastIndexOf('/') + 1) : '';
        const resolved = resolveImportPath(dir, importPath, entries);
        if (resolved) map[filename].push(resolved);
      }
    }
  }
  return map;
}

function resolveImportPath(dir, importPath, entries) {
  const candidates = [
    dir + importPath,
    dir + importPath + '.js',
    dir + importPath + '.ts',
    dir + importPath + '.tsx',
    dir + importPath + '/index.js',
    dir + importPath + '/index.ts',
  ];
  const fileSet = new Set(entries.map(([name]) => name));
  return candidates.find(c => fileSet.has(c)) || null;
}

function truncateContent(content) {
  if (!content || content.length <= TOKEN_BUDGET.MAX_FILE_CHARS) return content;
  const lines = content.split('\n');
  let result = '';
  let charCount = 0;
  for (const line of lines) {
    if (charCount + line.length + 1 > TOKEN_BUDGET.MAX_FILE_CHARS) {
      result += `\n... [truncated: ${content.length - charCount} chars, ${lines.length - result.split('\n').length} lines remaining]`;
      break;
    }
    result += line + '\n';
    charCount += line.length + 1;
  }
  return result.trimEnd();
}

function buildCompactTree(filenames, selectedFiles) {
  const selectedSet = new Set(Object.keys(selectedFiles));
  const allFiles = filenames.slice(0, TOKEN_BUDGET.TREE_MAX_FILES);
  const remaining = Math.max(0, filenames.length - TOKEN_BUDGET.TREE_MAX_FILES);
  
  const tree = {};
  for (const filepath of allFiles) {
    const parts = filepath.split('/');
    let current = tree;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (i === parts.length - 1) {
        current[part] = selectedSet.has(filepath) ? '★' : null;
      } else {
        current[part] = current[part] || {};
        current = current[part];
      }
    }
  }

  function render(node, prefix = '') {
    const entries = Object.entries(node);
    let result = '';
    for (let i = 0; i < entries.length; i++) {
      const [name, child] = entries[i];
      const isLast = i === entries.length - 1;
      const connector = isLast ? '└── ' : '├── ';
      const childPrefix = prefix + (isLast ? '    ' : '│   ');
      
      if (child === null) result += prefix + connector + name + '\n';
      else if (child === '★') result += prefix + connector + name + ' ★\n';
      else {
        result += prefix + connector + name + '/\n';
        result += render(child, childPrefix);
      }
    }
    return result;
  }

  let output = render(tree).trim() || '(no files)';
  if (remaining > 0) {
    output += `\n... and ${remaining} more files (showing ${TOKEN_BUDGET.TREE_MAX_FILES} of ${filenames.length})`;
  }
  return output;
}

// ─── PROMPT BUILDING ────────────────────────────────────────────────

function buildPrompt(projectFiles, userMessage, options = {}) {
  const {
    activeFile = null,
    recentFiles = [],
    consoleErrors = [],
    buildErrors = [],
    cursorPosition = null,
    selectedCode = null,
    chatHistory = [],
  } = options;

  const fileEntries = Object.entries(projectFiles);
  const mode = detectMode(userMessage, { consoleErrors, buildErrors });
  const systemPrompt = MODE_PROMPTS[mode] || MODE_PROMPTS.generic;

  if (fileEntries.length === 0) {
    return { messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMessage }], mode };
  }

  const selectedFiles = selectRelevantFiles(projectFiles, userMessage, activeFile, recentFiles);
  const allFilenames = Object.keys(projectFiles);
  const tree = buildCompactTree(allFilenames, selectedFiles);

  let contextParts = [];

  contextParts.push(`PROJECT STRUCTURE:\n${tree}`);

  const filesContext = Object.entries(selectedFiles).map(([filename, content]) => {
    const lines = content.split('\n');
    return `=== FILE: ${filename} (${lines.length} lines) ===\n\`\`\`\n${content}\n\`\`\``;
  }).join('\n\n');
  contextParts.push(filesContext);

  if (activeFile) {
    contextParts.push(`\nCURRENTLY EDITING: ${activeFile}`);
    if (cursorPosition) {
      contextParts.push(`Cursor at line ${cursorPosition.line}, column ${cursorPosition.column}`);
    }
    if (selectedCode) {
      contextParts.push(`SELECTED CODE:\n\`\`\`\n${selectedCode}\n\`\`\``);
    }
  }

  if (consoleErrors.length > 0) {
    contextParts.push(`\nCONSOLE ERRORS:\n${consoleErrors.map(e => `- ${e}`).join('\n')}`);
  }
  if (buildErrors.length > 0) {
    contextParts.push(`\nBUILD ERRORS:\n${buildErrors.map(e => `- ${e}`).join('\n')}`);
  }

  if (fileEntries.length > TOKEN_BUDGET.MAX_FILES) {
    contextParts.push(`\nNOTE: Project has ${fileEntries.length} files. Showing ${Object.keys(selectedFiles).length} most relevant. Ask for specific files if needed.`);
  }

  contextParts.push(`\nUSER REQUEST: ${userMessage}`);

  const fullPrompt = contextParts.join('\n\n');

  const messages = [{ role: 'system', content: systemPrompt }];
  
  const trimmedHistory = chatHistory.slice(-6);
  for (const msg of trimmedHistory) {
    messages.push({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: msg.content,
    });
  }

  messages.push({ role: 'user', content: fullPrompt });

  return { messages, mode };
}

// ─── OPENROUTER ─────────────────────────────────────────────────────

export async function fetchOpenRouterFreeModels() {
  try {
    const now = Date.now();
    if (cachedFreeModels && (now - lastModelFetch) < MODEL_CACHE_TTL_MS) {
      return cachedFreeModels;
    }

    const response = await fetch('https://openrouter.ai/api/v1/models', {
      headers: OPENROUTER_API_KEY ? { 'Authorization': `Bearer ${OPENROUTER_API_KEY}` } : {},
    });

    if (!response.ok) {
      console.warn('Failed to fetch OpenRouter models, using defaults');
      return DEFAULT_FREE_MODELS;
    }

    const data = await response.json();
    const freeModels = data.data
      ?.filter(m => {
        const isFreeSlug = m.id?.endsWith(':free');
        const isZeroPrice = m.pricing?.prompt === '0' && m.pricing?.completion === '0';
        const isZeroNum = parseFloat(m.pricing?.prompt) === 0 && parseFloat(m.pricing?.completion) === 0;
        return isFreeSlug || isZeroPrice || isZeroNum;
      })
      .map(m => m.id)
      .filter(id => id) || [];

    const merged = freeModels.length > 0 
      ? [...freeModels, ...DEFAULT_FREE_MODELS.filter(m => !freeModels.includes(m))]
      : DEFAULT_FREE_MODELS;

    cachedFreeModels = merged;
    lastModelFetch = now;
    console.log(`OpenRouter free models: ${merged.length} available`);
    return merged;
  } catch (error) {
    console.warn('Error fetching OpenRouter models:', error.message);
    return DEFAULT_FREE_MODELS;
  }
}

async function callOpenRouter(messages, preferredModel = null) {
  if (!OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY not set');

  const freeModels = await fetchOpenRouterFreeModels();
  const modelsToTry = preferredModel 
    ? [preferredModel, ...freeModels.filter(m => m !== preferredModel)]
    : freeModels;

  let lastError;
  for (const model of modelsToTry) {
    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': process.env.APP_URL || 'http://localhost:5002',
          'X-OpenRouter-Title': 'BadLson AI Code Editor',
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.3,
          max_tokens: 8192,
          route: 'fallback',
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        if ([429, 503, 404].includes(response.status)) {
          console.warn(`Model ${model} unavailable (${response.status}), trying next...`);
          lastError = new Error(`OpenRouter ${model}: ${errorText}`);
          continue;
        }
        throw new Error(`OpenRouter API error ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      if (!data.choices?.[0]?.message?.content) {
        throw new Error('Invalid response from OpenRouter');
      }

      return {
        content: data.choices[0].message.content,
        model: data.model || model,
        provider: 'openrouter',
      };
    } catch (error) {
      console.warn(`OpenRouter model ${model} failed:`, error.message);
      lastError = error;
    }
  }

  throw lastError || new Error('All OpenRouter models failed');
}

async function streamOpenRouter(messages, onChunk, preferredModel = null) {
  if (!OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY not set');

  const freeModels = await fetchOpenRouterFreeModels();
  const modelsToTry = preferredModel 
    ? [preferredModel, ...freeModels.filter(m => m !== preferredModel)]
    : freeModels;

  let lastError;
  for (const model of modelsToTry) {
    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': process.env.APP_URL || 'http://localhost:5002',
          'X-OpenRouter-Title': 'BadLson AI Code Editor',
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.3,
          max_tokens: 8192,
          stream: true,
          route: 'fallback',
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        if ([429, 503, 404].includes(response.status)) {
          lastError = new Error(`OpenRouter ${model}: ${errorText}`);
          continue;
        }
        throw new Error(`OpenRouter streaming error ${response.status}: ${errorText}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';
      let actualModel = model;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(line => line.trim().startsWith('data:'));

        for (const line of lines) {
          const data = line.replace('data:', '').trim();
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            if (parsed.model) actualModel = parsed.model;
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              fullText += content;
              if (onChunk) onChunk(content);
            }
          } catch { /* skip invalid JSON */ }
        }
      }

      return {
        content: cleanResponse(fullText),
        model: actualModel,
        provider: 'openrouter',
      };
    } catch (error) {
      console.warn(`OpenRouter stream model ${model} failed:`, error.message);
      lastError = error;
    }
  }

  throw lastError || new Error('All OpenRouter stream models failed');
}

// ─── GROQ ─────────────────────────────────────────────────────────

async function callGroq(messages, model = 'meta-llama/llama-4-scout-17b-16e-instruct') {
  if (!GROQ_API_KEY) throw new Error('GROQ_API_KEY not set');

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.3,
      max_tokens: 8192,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Groq API error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  if (!data.choices?.[0]?.message?.content) {
    throw new Error('Invalid response from Groq');
  }

  return {
    content: data.choices[0].message.content,
    model: data.model || model,
    provider: 'groq',
  };
}

async function streamGroq(messages, onChunk) {
  if (!GROQ_API_KEY) throw new Error('GROQ_API_KEY not set');

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'meta-llama/llama-4-scout-17b-16e-instruct',
      messages,
      temperature: 0.3,
      max_tokens: 8192,
      stream: true,
    }),
  });

  if (!response.ok) {
    throw new Error(`Groq streaming error: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value);
    const lines = chunk.split('\n').filter(line => line.trim().startsWith('data:'));

    for (const line of lines) {
      const data = line.replace('data:', '').trim();
      if (data === '[DONE]') continue;

      try {
        const parsed = JSON.parse(data);
        const content = parsed.choices?.[0]?.delta?.content;
        if (content) {
          fullText += content;
          if (onChunk) onChunk(content);
        }
      } catch { /* skip invalid JSON */ }
    }
  }

  return {
    content: cleanResponse(fullText),
    model: 'meta-llama/llama-4-scout-17b-16e-instruct',
    provider: 'groq',
  };
}

// ─── GEMINI-SPECIFIC SYSTEM PROMPT ─────────────────────────────────

const GEMINI_SYSTEM = `You are a code editor AI. You MUST follow these rules EXACTLY:

RULE 1: When changing code, use ONLY this format:
\`\`\`edit:FULL_FILE_PATH
// complete file content here
\`\`\`

RULE 2: NEVER use any other format. No comments, no explanations inside code blocks.

RULE 3: If you are not changing code, just chat normally.

RULE 4: Example of CORRECT output:
I will update the styles.
\`\`\`edit:styles.css
body { margin: 0; padding: 0; }
\`\`\`

RULE 5: Example of WRONG output (NEVER do this):
Here is the CSS:
\`\`\`css
body { margin: 0; }
\`\`\`

RULE 6: The edit block must contain the COMPLETE file content, not just changes.

RULE 7: After giving code, say: **File Completed:** filename`;

// ─── GEMINI ─────────────────────────────────────────────────────────

async function callGemini(messages, model = 'gemini-2.5-flash') {
  if (!geminiClient) throw new Error('GEMINI_API_KEY not set');

  const systemMsg = messages.find(m => m.role === 'system')?.content || '';
  const userMessages = messages.filter(m => m.role !== 'system');
  
  const fullPrompt = GEMINI_SYSTEM + '\n\n=== PROJECT CONTEXT ===\n' + 
    userMessages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n');

  try {
    const result = await geminiClient.models.generateContent({
      model,
      contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
      config: {
        maxOutputTokens: 8192,
        temperature: 0.1,
        topP: 0.1,
      },
    });

    let text = '';
    if (result.text) {
      text = result.text;
    } else if (result.candidates?.[0]?.content?.parts?.[0]?.text) {
      text = result.candidates[0].content.parts[0].text;
    }

    console.log(`[Gemini] Raw response length: ${text?.length || 0}`);
    console.log(`[Gemini] First 200 chars: ${text?.slice(0, 200)}`);

    if (!text || text.trim().length === 0) {
      const finishReason = result.candidates?.[0]?.finishReason;
      throw new Error(`Gemini empty response. Finish reason: ${finishReason || 'unknown'}`);
    }

    return {
      content: text,
      model,
      provider: 'gemini',
    };
  } catch (error) {
    console.error('[Gemini] Error:', error.message);
    throw error;
  }
}

async function streamGemini(messages, onChunk, model = 'gemini-2.5-flash') {
  if (!geminiClient) throw new Error('GEMINI_API_KEY not set');

  const systemMsg = messages.find(m => m.role === 'system')?.content || '';
  const userMessages = messages.filter(m => m.role !== 'system');
  
  const fullPrompt = GEMINI_SYSTEM + '\n\n=== PROJECT CONTEXT ===\n' + 
    userMessages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n');

  try {
    const result = await geminiClient.models.generateContentStream({
      model,
      contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
      config: {
        maxOutputTokens: 8192,
        temperature: 0.1,
        topP: 0.1,
      },
    });

    let fullText = '';
    
    for await (const chunk of result) {
      let text = '';
      if (chunk.text) {
        text = chunk.text;
      } else if (chunk.candidates?.[0]?.content?.parts?.[0]?.text) {
        text = chunk.candidates[0].content.parts[0].text;
      }

      if (text) {
        fullText += text;
        if (onChunk) onChunk(text);
      }
    }

    if (!fullText || fullText.trim().length === 0) {
      throw new Error('Gemini streaming returned no content.');
    }

    return {
      content: cleanResponse(fullText),
      model,
      provider: 'gemini',
    };
  } catch (error) {
    console.error('[Gemini] Stream error:', error.message);
    throw error;
  }
}

// ─── RESPONSE CLEANING & PARSING ────────────────────────────────────

function cleanResponse(text) {
  if (!text) return '';
  return text
    .replace(/text\s*Copy\s*Apply/gi, '')
    .replace(/\bCopy\s*Apply\b/gi, '')
    .replace(/```text\s*\n/g, '\n')
    .replace(/```\s*text\s*/g, '')
    .replace(/\/\*[\s\S]*?AI[\s\S]*?SUGGESTION[\s\S]*?\*\//gi, '')
    .replace(/<!--[\s\S]*?AI[\s\S]*?SUGGESTION[\s\S]*?-->/gi, '')
    .replace(/Apply\s*Edit/gi, '')
    .trim();
}

export function parseAiResponse(response) {
  if (!response) return { message: '', edits: [], mode: 'generic' };

  const cleaned = typeof response === 'string' ? cleanResponse(response) : cleanResponse(response.content || '');

  const editPatterns = [
    /```edit:([^\n]+)\n([\s\S]*?)```/g,
    /```\s*edit:([^\n]+)\n([\s\S]*?)```/g,
    /```file:([^\n]+)\n([\s\S]*?)```/g,
    /```\s*([^\n]+\.(?:html|css|js|ts|tsx|jsx))\n([\s\S]*?)```/g,
  ];

  const edits = [];
  for (const pattern of editPatterns) {
    let match;
    while ((match = pattern.exec(cleaned)) !== null) {
      const existing = edits.find(e => e.filename === match[1].trim() && e.code === match[2].trim());
      if (!existing) {
        edits.push({ filename: match[1].trim(), code: match[2].trim() });
      }
    }
  }

  if (edits.length === 0) {
    const codeBlockRegex = /```(?:html|css|js|ts|tsx|jsx|javascript|typescript)\n([\s\S]*?)```/g;
    let match;
    while ((match = codeBlockRegex.exec(cleaned)) !== null) {
      const filename = guessFilenameFromContext(cleaned, match[1]);
      if (filename) {
        edits.push({ filename, code: match[1].trim() });
      }
    }
  }

  const fileCompletedRegex = /\*\*File Completed:\s*([^\n]+)\*\*/i;
  const completedMatch = cleaned.match(fileCompletedRegex);

  let message = cleaned;
  for (const pattern of editPatterns) {
    message = message.replace(pattern, '');
  }
  
  message = message
    .replace(/\*\*File Completed:[^\n]*\*\*/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  let detectedMode = 'generic';
  if (message.includes('BUG:') || message.includes('FIX:')) detectedMode = 'debug';
  else if (message.includes('REVIEW:') || message.includes('ISSUE:')) detectedMode = 'review';
  else if (message.includes('EXPLANATION:')) detectedMode = 'explain';
  else if (edits.length > 0) detectedMode = 'code';

  return { message, edits, mode: detectedMode, completedFile: completedMatch?.[1]?.trim() };
}

function guessFilenameFromContext(text, code) {
  const fileMatch = text.match(/(?:update|change|edit|modify|fix)\s+['"]?([^'"\s]+\.(?:html|css|js|ts|tsx|jsx))['"]?/i);
  if (fileMatch) return fileMatch[1];
  
  if (code.includes('<!DOCTYPE') || code.includes('<html')) return 'index.html';
  if (code.includes('@tailwind') || code.includes(':root {') || code.includes('@import')) return 'styles.css';
  if (code.includes('import React') || code.includes('export default')) return 'App.tsx';
  if (code.includes('import {') && code.includes('from')) return 'App.tsx';
  
  return null;
}

// ─── SMART EDIT APPLICATION ────────────────────────────────────────

export function applyEdits(projectFiles, edits, options = {}) {
  const { activeFile = null, strategy = 'smart' } = options;
  const updatedFiles = { ...projectFiles };
  const applied = [];
  const failed = [];

  for (const edit of edits) {
    const { filename, code } = edit;
    
    if (!code || code.length < 5) {
      failed.push({ filename, reason: 'Empty or too short edit block' });
      continue;
    }

    if (!updatedFiles.hasOwnProperty(filename)) {
      updatedFiles[filename] = code;
      applied.push({ filename, type: 'created' });
      continue;
    }

    const original = updatedFiles[filename];
    
    if (strategy === 'replace') {
      updatedFiles[filename] = code;
      applied.push({ filename, type: 'replaced' });
      continue;
    }

    const result = smartApplyEdit(original, code, filename === activeFile);
    
    if (result.success) {
      updatedFiles[filename] = result.content;
      applied.push({ filename, type: result.type });
    } else {
      failed.push({ filename, reason: result.reason });
      console.warn(`[AI] Edit failed for ${filename}: ${result.reason}`);
    }
  }

  return { updatedFiles, applied, failed };
}

function smartApplyEdit(original, newCode, isActiveFile) {
  if (newCode.includes('<!DOCTYPE') || newCode.includes('<html') || 
      (newCode.includes('export default') && original.includes('export default')) ||
      newCode.length > original.length * 0.85) {
    return { success: true, content: newCode, type: 'replaced' };
  }

  const funcRegex = /(?:export\s+(?:default\s+)?)?(?:async\s+)?function\s+(\w+)|class\s+(\w+)|const\s+(\w+)\s*=\s*(?:async\s*)?\(/g;
  const newFuncs = [];
  let m;
  while ((m = funcRegex.exec(newCode)) !== null) {
    newFuncs.push(m[1] || m[2] || m[3]);
  }

  if (newFuncs.length === 1) {
    const funcName = newFuncs[0];
    const funcPattern = new RegExp(
      `((?:export\\s+(?:default\\s+)?)?(?:async\\s+)?(?:function\\s+|class\\s+|const\\s+)${funcName}\\s*[=(])` +
      `[\\s\\S]*?(?=(?:\\n(?:export\\s|class\\s|function\\s|const\\s|let\\s|var\\s)|$))`,
      'm'
    );
    
    if (funcPattern.test(original)) {
      const replaced = original.replace(funcPattern, newCode.trim());
      if (replaced !== original) {
        return { success: true, content: replaced, type: 'patched' };
      }
    }
  }

  if (isActiveFile && newCode.length < original.length * 0.3) {
    return { 
      success: true, 
      content: original + '\n\n' + newCode,
      type: 'appended' 
    };
  }

  return { 
    success: false, 
    reason: 'Could not determine insertion point. Code does not match any existing function/class. Ask the user to clarify.' 
  };
}

// ─── PROVIDER CHAIN ─────────────────────────────────────────────────

function getProviderChain(preferredProvider = 'openrouter') {
  const allProviders = ['openrouter', 'groq', 'gemini'];
  const ordered = [preferredProvider, ...allProviders.filter(p => p !== preferredProvider)];
  
  return ordered.map(p => {
    switch (p) {
      case 'openrouter': return { name: 'openrouter', call: (msgs) => callOpenRouter(msgs) };
      case 'groq': return { name: 'groq', call: (msgs) => callGroq(msgs) };
      case 'gemini': return { name: 'gemini', call: (msgs) => callGemini(msgs, 'gemini-2.5-flash') };
      default: return { name: 'openrouter', call: (msgs) => callOpenRouter(msgs) };
    }
  });
}

function getStreamProviderChain(preferredProvider = 'openrouter') {
  const allProviders = ['openrouter', 'groq', 'gemini'];
  const ordered = [preferredProvider, ...allProviders.filter(p => p !== preferredProvider)];
  
  return ordered.map(p => {
    switch (p) {
      case 'openrouter': return { name: 'openrouter', call: (msgs, onChunk) => streamOpenRouter(msgs, onChunk) };
      case 'groq': return { name: 'groq', call: (msgs, onChunk) => streamGroq(msgs, onChunk) };
      case 'gemini': return { name: 'gemini', call: (msgs, onChunk) => streamGemini(msgs, onChunk, 'gemini-2.5-flash') };
      default: return { name: 'openrouter', call: (msgs, onChunk) => streamOpenRouter(msgs, onChunk) };
    }
  });
}

// ─── MAIN GENERATION ────────────────────────────────────────────────

export async function generateCodeResponse(projectFiles, userMessage, options = {}) {
  const { provider = 'openrouter' } = options;
  
  try {
    const { messages, mode } = buildPrompt(projectFiles, userMessage, options);
    console.log(`[AI] Mode detected: ${mode}, Provider: ${provider}`);

    const chain = getProviderChain(provider);
    let lastError;

    for (const { name, call } of chain) {
      try {
        const result = await call(messages);
        if (!result?.content) continue;
        
        const cleaned = cleanResponse(result.content);
        console.log(`[AI] Success: ${name}/${result.model}, length: ${cleaned.length}, mode: ${mode}`);
        
        return {
          content: cleaned,
          provider: result.provider,
          model: result.model,
          mode,
      };
      } catch (error) {
        console.warn(`[AI] Provider ${name} failed:`, error.message);
        lastError = error;
      }
    }

    console.error('[AI] All providers failed:', lastError);
    return getFallbackResponse();
  } catch (error) {
    console.error('[AI] generateCodeResponse error:', error);
    return getFallbackResponse();
  }
}

export async function streamCodeResponse(projectFiles, userMessage, onChunk, options = {}) {
  const { provider = 'openrouter' } = options;
  
  try {
    const { messages, mode } = buildPrompt(projectFiles, userMessage, options);
    console.log(`[AI] Stream mode: ${mode}, Provider: ${provider}`);

    const chain = getStreamProviderChain(provider);
    let lastError;

    for (const { name, call } of chain) {
      try {
        const result = await call(messages, onChunk);
        console.log(`[AI] Stream success: ${name}/${result.model}`);
        return {
          content: result.content,
          provider: result.provider,
          model: result.model,
          mode,
      };
      } catch (error) {
        console.warn(`[AI] Stream provider ${name} failed:`, error.message);
        lastError = error;
      }
    }

    throw lastError || new Error('All streaming providers failed');
  } catch (error) {
    console.error('[AI] streamCodeResponse error:', error);
    const fallback = getFallbackResponse();
    if (onChunk) onChunk(fallback);
    return fallback;
  }
}

function getFallbackResponse() {
  return 'I apologize, but I encountered an error processing your request. Please check your API configuration and try again.';
}

// ─── HEALTH CHECKS ──────────────────────────────────────────────────

export async function testConnection() {
  const results = {};

  if (OPENROUTER_API_KEY) {
    try {
      const messages = [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Say "OK" in one word.' },
      ];
      const response = await callOpenRouter(messages);
      results.openrouter = { status: 'ok', response: response.content.trim(), model: response.model };
    } catch (error) {
      results.openrouter = { status: 'error', error: error.message };
    }
  } else {
    results.openrouter = { status: 'not_configured' };
  }

  if (GROQ_API_KEY) {
    try {
      const messages = [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Say "OK" in one word.' },
      ];
      const response = await callGroq(messages);
      results.groq = { status: 'ok', response: response.content.trim() };
    } catch (error) {
      results.groq = { status: 'error', error: error.message };
    }
  } else {
    results.groq = { status: 'not_configured' };
  }

  if (geminiClient) {
    try {
      const messages = [{ role: 'user', content: 'Say "OK" in one word.' }];
      const response = await callGemini(messages);
      results.gemini = { status: 'ok', response: response.content.trim() };
    } catch (error) {
      results.gemini = { status: 'error', error: error.message };
    }
  } else {
    results.gemini = { status: 'not_configured' };
  }

  return results;
}

export async function getAvailableModels() {
  const freeModels = await fetchOpenRouterFreeModels();
  return {
    openrouter: { configured: !!OPENROUTER_API_KEY, freeModels, defaultModels: DEFAULT_FREE_MODELS },
    groq: { configured: !!GROQ_API_KEY, models: ['meta-llama/llama-4-scout-17b-16e-instruct', 'llama-3.3-70b-versatile'] },
    gemini: { configured: !!GEMINI_API_KEY, models: ['gemini-2.5-flash', 'gemini-2.5-pro'] },
  };
}
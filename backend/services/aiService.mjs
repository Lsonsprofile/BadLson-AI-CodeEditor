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

if (!GROQ_API_KEY) {
  console.error('GROQ_API_KEY not found');
} else {
  console.log('GROQ_API_KEY loaded, length:', GROQ_API_KEY.length);
}

if (!GEMINI_API_KEY) {
  console.error('GEMINI_API_KEY not found');
} else {
  console.log('GEMINI_API_KEY loaded, length:', GEMINI_API_KEY.length);
}

if (!OPENROUTER_API_KEY) {
  console.error('OPENROUTER_API_KEY not found');
} else {
  console.log('OPENROUTER_API_KEY loaded, length:', OPENROUTER_API_KEY.length);
}

const SYSTEM_INSTRUCTION = `You are a Senior Full-Stack Developer and coding assistant in BadLson_AI_code Editor.

Your job is to help the user write, debug, and improve code. You understand complex questions and can work with multiple files, nested folders, and large projects.

HOW TO EDIT FILES:
When the user asks you to change, fix, update, or add code to ANY file, you MUST use this EXACT format:

\`\`\`edit:FULL_FILE_PATH
// the complete new code for this file
\`\`\`

Examples:
- \`\`\`edit:index.html
- \`\`\`edit:Lson/index.js
- \`\`\`edit:components/Header.tsx
- \`\`\`edit:src/styles/main.css

RULES:
- ALWAYS use \`\`\`edit:path for code changes. Never use plain \`\`\`javascript or \`\`\`css for edits.
- If the user asks about code, explain clearly and thoroughly.
- If the user asks for a feature, provide complete working code.
- Reference files by their FULL PATH from the project root.
- Only output the changed/new code inside edit blocks, not full files unless asked.
- You can suggest changes to multiple files in one response.
- Be precise. Do not guess. If you need more info, ask.

TECH STACK:
- JavaScript: ES6+
- CSS: standard CSS, Tailwind
- HTML: HTML5
- React when relevant`;

function getFallbackResponse() {
  const responses = [
    "I'd help with that, but the AI service is currently experiencing high demand. Please try again in a few moments.",
    "The AI is temporarily busy. Please try again shortly.",
    "I'm currently unavailable due to high traffic. Try again in a minute or two.",
    "AI service is experiencing a spike in demand. Please wait a moment and try your request again.",
    "Sorry, I'm getting a lot of requests right now. Please try again in a few moments."
  ];
  return responses[Math.floor(Math.random() * responses.length)];
}

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

// ─── TOKEN BUDGET CONFIG ────────────────────────────────────────────
const TOKEN_BUDGET = {
  MAX_TOTAL_CHARS: 100000,      // ~25k tokens (rough estimate: 4 chars = 1 token)
  MAX_FILE_CHARS: 8000,         // Cap individual files at ~2k tokens
  MAX_FILES: 50,                // Max number of files to include
  TREE_MAX_FILES: 200,          // Max files to show in tree structure
};

// ─── SMART FILE SELECTION ───────────────────────────────────────────

/**
 * Selects the most relevant files from a large project for AI context.
 * With 45k files, we can't send everything — we need to be smart.
 */
export function selectRelevantFiles(projectFiles, userMessage, activeFile = null) {
  const entries = Object.entries(projectFiles);
  const totalFiles = entries.length;
  
  if (totalFiles === 0) return {};

  // If small project (< MAX_FILES), send everything
  if (totalFiles <= TOKEN_BUDGET.MAX_FILES) {
    return Object.fromEntries(
      entries.map(([name, content]) => [name, truncateContent(content)])
    );
  }

  const msgLower = userMessage.toLowerCase();
  const msgWords = new Set(msgLower.split(/\W+/).filter(w => w.length > 2));
  
  // Score each file by relevance
  const scoredFiles = entries.map(([filename, content]) => {
    let score = 0;
    const fileLower = filename.toLowerCase();
    const contentLower = content.toLowerCase();
    const contentWords = contentLower.split(/\W+/).filter(w => w.length > 2);
    const contentWordSet = new Set(contentWords);
    
    // Active file gets massive boost
    if (activeFile && (filename === activeFile || fileLower.includes(activeFile.toLowerCase()))) {
      score += 1000;
    }
    
    // Filename matches query words
    for (const word of msgWords) {
      if (fileLower.includes(word)) score += 50;
    }
    
    // Content matches query words
    let contentMatches = 0;
    for (const word of msgWords) {
      if (contentWordSet.has(word)) contentMatches++;
    }
    score += contentMatches * 10;
    
    // Prefer smaller files (more likely to be focused modules)
    const sizeBonus = Math.max(0, 5000 - content.length) / 100;
    score += sizeBonus;
    
    // Entry point files get bonus
    if (filename === 'index.html' || filename === 'index.js' || filename === 'app.js' || 
        filename === 'main.js' || filename === 'main.css' || filename.endsWith('/index.js')) {
      score += 30;
    }
    
    // Config files usually not relevant
    if (filename.includes('package.json') || filename.includes('.gitignore') || 
        filename.includes('README') || filename.includes('node_modules')) {
      score -= 50;
    }
    
    return { filename, content, score };
  });

  // Sort by score descending
  scoredFiles.sort((a, b) => b.score - a.score);
  
  // Take top N files
  const selected = scoredFiles.slice(0, TOKEN_BUDGET.MAX_FILES);
  
  // Always include active file if it exists and wasn't in top N
  if (activeFile && projectFiles[activeFile] && !selected.find(f => f.filename === activeFile)) {
    selected.pop(); // Remove lowest scored
    selected.push({ 
      filename: activeFile, 
      content: projectFiles[activeFile], 
      score: 9999 
    });
  }
  
  // Always include index.html if it exists (entry point)
  if (projectFiles['index.html'] && !selected.find(f => f.filename === 'index.html')) {
    const idxEntry = scoredFiles.find(f => f.filename === 'index.html');
    if (idxEntry) {
      selected.pop();
      selected.push(idxEntry);
    }
  }

  return Object.fromEntries(
    selected.map(({ filename, content }) => [filename, truncateContent(content)])
  );
}

/**
 * Truncates file content to stay within token budget per file.
 */
function truncateContent(content) {
  if (!content || content.length <= TOKEN_BUDGET.MAX_FILE_CHARS) return content;
  
  const lines = content.split('\n');
  let result = '';
  let charCount = 0;
  
  // Take first N lines that fit
  for (const line of lines) {
    if (charCount + line.length + 1 > TOKEN_BUDGET.MAX_FILE_CHARS) {
      result += `\n... [truncated, ${content.length - charCount} more chars, ${lines.length - result.split('\n').length} more lines]`;
      break;
    }
    result += line + '\n';
    charCount += line.length + 1;
  }
  
  return result.trimEnd();
}

/**
 * Builds a compact file tree showing only up to TREE_MAX_FILES.
 */
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
      
      if (child === null) {
        result += prefix + connector + name + '\n';
      } else if (child === '★') {
        result += prefix + connector + name + ' ★\n';
      } else {
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

function buildPrompt(projectFiles, userMessage, activeFile = null) {
  const fileEntries = Object.entries(projectFiles);
  
  if (fileEntries.length === 0) {
    return `User: ${userMessage}\n\n(No files open currently)`;
  }

  // For large projects, select only relevant files
  const selectedFiles = selectRelevantFiles(projectFiles, userMessage, activeFile);
  const allFilenames = Object.keys(projectFiles);
  
  const tree = buildCompactTree(allFilenames, selectedFiles);
  
  const filesContext = Object.entries(selectedFiles).map(([filename, content]) => {
    const lines = content.split('\n');
    return `=== FILE: ${filename} (${lines.length} lines) ===\n\`\`\`\n${content}\n\`\`\``;
  }).join('\n\n');

  const activeHint = activeFile 
    ? `\n\nCURRENTLY EDITING: ${activeFile}\nThis is the file the user is most likely asking about.` 
    : '';

  const selectionNote = fileEntries.length > TOKEN_BUDGET.MAX_FILES
    ? `\n\nNOTE: This project has ${fileEntries.length} files. Only the most relevant ${Object.keys(selectedFiles).length} files are shown above. If you need to see other files, ask specifically.`
    : '';

  return `PROJECT STRUCTURE:
${tree}

${filesContext}${activeHint}${selectionNote}

INSTRUCTION: ${userMessage}

REMEMBER:
- Reference files by their full path (e.g., "Lson/index.js")
- When editing nested files, use format: \`\`\`edit:Lson/index.js
- Only show changed code in \`\`\`edit:filepath\`\`\` blocks
- Do NOT output full files unless explicitly asked
- The user is currently looking at: ${activeFile || 'no specific file'}`;
}

// ─── OPENROUTER ─────────────────────────────────────────────────────

export async function fetchOpenRouterFreeModels() {
  try {
    const now = Date.now();
    if (cachedFreeModels && (now - lastModelFetch) < MODEL_CACHE_TTL_MS) {
      return cachedFreeModels;
    }

    const response = await fetch('https://openrouter.ai/api/v1/models', {
      headers: OPENROUTER_API_KEY ? {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      } : {},
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
    
    console.log(`OpenRouter free models refreshed: ${merged.length} models available`);
    return merged;
  } catch (error) {
    console.warn('Error fetching OpenRouter models:', error.message);
    return DEFAULT_FREE_MODELS;
  }
}

async function callOpenRouter(messages, preferredModel = null) {
  if (!OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY not set');
  }

  const freeModels = await fetchOpenRouterFreeModels();
  const modelsToTry = preferredModel 
    ? [preferredModel, ...freeModels.filter(m => m !== preferredModel)]
    : freeModels;

  let lastError;

  for (const model of modelsToTry) {
    try {
      console.log(`Trying OpenRouter model: ${model}`);
      
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
          temperature: 0.7,
          max_tokens: 4096,
          route: 'fallback',
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        if (response.status === 429 || response.status === 503 || response.status === 404) {
          console.warn(`Model ${model} unavailable (${response.status}), trying next...`);
          lastError = new Error(`OpenRouter ${model}: ${errorText}`);
          continue;
        }
        throw new Error(`OpenRouter API error ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      
      if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        throw new Error('Invalid response from OpenRouter');
      }

      console.log(`OpenRouter success with model: ${model}`);
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
  if (!OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY not set');
  }

  const freeModels = await fetchOpenRouterFreeModels();
  const modelsToTry = preferredModel 
    ? [preferredModel, ...freeModels.filter(m => m !== preferredModel)]
    : freeModels;

  let lastError;

  for (const model of modelsToTry) {
    try {
      console.log(`Trying OpenRouter stream with model: ${model}`);
      
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
          temperature: 0.7,
          max_tokens: 4096,
          stream: true,
          route: 'fallback',
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        if (response.status === 429 || response.status === 503 || response.status === 404) {
          console.warn(`Model ${model} unavailable (${response.status}), trying next...`);
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
          } catch {
            // Skip invalid JSON
          }
        }
      }

      console.log(`OpenRouter stream success with model: ${actualModel}`);
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
  if (!GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY not set');
  }

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.7,
      max_tokens: 4096,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Groq API error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  
  if (!data.choices || !data.choices[0] || !data.choices[0].message) {
    throw new Error('Invalid response from Groq');
  }

  return {
    content: data.choices[0].message.content,
    model: data.model || model,
    provider: 'groq',
  };
}

async function streamGroq(messages, onChunk) {
  if (!GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY not set');
  }

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'meta-llama/llama-4-scout-17b-16e-instruct',
      messages,
      temperature: 0.7,
      max_tokens: 4096,
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
      } catch {
        // Skip invalid JSON
      }
    }
  }

  return {
    content: cleanResponse(fullText),
    model: 'meta-llama/llama-4-scout-17b-16e-instruct',
    provider: 'groq',
  };
}

// ─── GEMINI ─────────────────────────────────────────────────────────

async function callGemini(prompt, model = 'gemini-2.5-flash') {
  if (!geminiClient) {
    throw new Error('GEMINI_API_KEY not set');
  }

  const result = await geminiClient.models.generateContent({
    model,
    contents: [
      { role: 'user', parts: [{ text: SYSTEM_INSTRUCTION + '\n\n' + prompt }] }
    ],
    config: {
      maxOutputTokens: 4096,
      temperature: 0.7,
    },
  });

  return {
    content: result.text,
    model,
    provider: 'gemini',
  };
}

// ─── RESPONSE PARSING ───────────────────────────────────────────────

export function parseAiResponse(response) {
  if (!response) return { message: '', edits: [] };

  const editRegex = /```edit:([^\n]+)\n([\s\S]*?)```/g;
  const edits = [];
  let match;
  
  while ((match = editRegex.exec(response)) !== null) {
    edits.push({
      filename: match[1].trim(),
      code: match[2].trim()
    });
  }

  let message = response
    .replace(editRegex, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { message, edits };
}

export function applyEdits(projectFiles, edits) {
  const updatedFiles = { ...projectFiles };
  const applied = [];
  const failed = [];

  for (const edit of edits) {
    const { filename, code } = edit;
    
    if (!updatedFiles.hasOwnProperty(filename)) {
      updatedFiles[filename] = code;
      applied.push({ filename, type: 'created' });
      continue;
    }

    const original = updatedFiles[filename];
    
    if (code.length < original.length * 0.8) {
      const normalizedCode = code.replace(/\s+/g, ' ').trim();
      const normalizedOriginal = original.replace(/\s+/g, ' ').trim();
      
      if (normalizedOriginal.includes(normalizedCode)) {
        applied.push({ filename, type: 'unchanged' });
        continue;
      }
    }

    if (code.includes('<!DOCTYPE') || code.includes('<html') || 
        code.includes('export default') || code.includes('function') ||
        code.length > original.length * 0.5) {
      updatedFiles[filename] = code;
      applied.push({ filename, type: 'replaced' });
    } else {
      updatedFiles[filename] = original + `\n\n/* AI SUGGESTION for ${filename}:\n${code}\n*/`;
      applied.push({ filename, type: 'appended' });
      failed.push({ filename, reason: 'Could not determine exact insertion point. Suggestion appended as comment.' });
    }
  }

  return { updatedFiles, applied, failed };
}

function cleanResponse(text) {
  if (!text) return '';
  return text
    .replace(/text\s*Copy\s*Apply/gi, '')
    .replace(/\bCopy\s*Apply\b/gi, '')
    .replace(/```text\s*\n/g, '\n')
    .replace(/```\s*text\s*/g, '');
}

// ─── PROVIDER CHAIN ─────────────────────────────────────────────────

function getProviderChain(preferredProvider = 'openrouter') {
  const allProviders = ['openrouter', 'groq', 'gemini'];
  const ordered = [preferredProvider, ...allProviders.filter(p => p !== preferredProvider)];
  
  return ordered.map(p => {
    switch (p) {
      case 'openrouter':
        return { name: 'openrouter', call: (msgs) => callOpenRouter(msgs) };
      case 'groq':
        return { name: 'groq', call: (msgs) => callGroq(msgs) };
      case 'gemini':
        return { name: 'gemini', call: null };
      default:
        return { name: 'openrouter', call: (msgs) => callOpenRouter(msgs) };
    }
  });
}

// ─── MAIN GENERATION ────────────────────────────────────────────────

export async function generateCodeResponse(projectFiles, userMessage, chatHistory = [], provider = 'openrouter', activeFile = null) {
  try {
    const prompt = buildPrompt(projectFiles, userMessage, activeFile);
    
    const messages = [
      { role: 'system', content: SYSTEM_INSTRUCTION },
    ];

    const trimmedHistory = chatHistory.slice(-5);
    for (const msg of trimmedHistory) {
      messages.push({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content,
      });
    }

    messages.push({ role: 'user', content: prompt });

    const chain = getProviderChain(provider);
    let lastError;

    for (const { name, call } of chain) {
      try {
        let result;
        
        if (name === 'gemini') {
          result = await callGemini(prompt, 'gemini-2.5-flash');
        } else {
          result = await call(messages);
        }

        if (!result || !result.content) continue;
        
        const cleaned = cleanResponse(result.content);
        console.log(`Success with provider: ${name}, model: ${result.model}, length: ${cleaned.length}`);
        
        return cleaned;
      } catch (error) {
        console.warn(`Provider ${name} failed:`, error.message);
        lastError = error;
        continue;
      }
    }

    console.error('All AI providers failed:', lastError);
    return getFallbackResponse();
  } catch (error) {
    console.error('generateCodeResponse error:', error);
    return getFallbackResponse();
  }
}

export async function streamCodeResponse(projectFiles, userMessage, chatHistory = [], onChunk, provider = 'openrouter', activeFile = null) {
  try {
    const prompt = buildPrompt(projectFiles, userMessage, activeFile);

    if (provider === 'gemini') {
      const response = await generateCodeResponse(projectFiles, userMessage, chatHistory, 'gemini', activeFile);
      if (onChunk) {
        const chunks = response.split(' ');
        for (const chunk of chunks) {
          onChunk(chunk + ' ');
          await new Promise(r => setTimeout(r, 20));
        }
      }
      return response;
    }

    const messages = [
      { role: 'system', content: SYSTEM_INSTRUCTION },
      ...chatHistory.slice(-5).map(m => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.content,
      })),
      { role: 'user', content: prompt },
    ];

    const streamProviders = provider === 'openrouter' 
      ? [
          { name: 'openrouter', call: () => streamOpenRouter(messages, onChunk) },
          { name: 'groq', call: () => streamGroq(messages, onChunk) },
        ]
      : [
          { name: 'groq', call: () => streamGroq(messages, onChunk) },
          { name: 'openrouter', call: () => streamOpenRouter(messages, onChunk) },
        ];

    let lastError;
    for (const { name, call } of streamProviders) {
      try {
        const result = await call();
        console.log(`Stream success with provider: ${name}, model: ${result.model}`);
        return result.content;
      } catch (error) {
        console.warn(`Stream provider ${name} failed:`, error.message);
        lastError = error;
        continue;
      }
    }

    throw lastError || new Error('All streaming providers failed');
  } catch (error) {
    console.error('streamCodeResponse error:', error);
    const fallback = getFallbackResponse();
    if (onChunk) onChunk(fallback);
    return fallback;
  }
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
      results.openrouter = { 
        status: 'ok', 
        response: response.content.trim(),
        model: response.model,
      };
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
      const response = await callGroq(messages, 'meta-llama/llama-4-scout-17b-16e-instruct');
      results.groq = { status: 'ok', response: response.content.trim() };
    } catch (error) {
      results.groq = { status: 'error', error: error.message };
    }
  } else {
    results.groq = { status: 'not_configured' };
  }

  if (geminiClient) {
    try {
      const response = await callGemini('Say "OK" in one word.', 'gemini-2.5-flash');
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
    openrouter: {
      configured: !!OPENROUTER_API_KEY,
      freeModels: freeModels,
      defaultModels: DEFAULT_FREE_MODELS,
    },
    groq: {
      configured: !!GROQ_API_KEY,
      models: ['meta-llama/llama-4-scout-17b-16e-instruct', 'llama-3.3-70b-versatile'],
    },
    gemini: {
      configured: !!GEMINI_API_KEY,
      models: ['gemini-2.5-flash', 'gemini-2.5-pro'],
    },
  };
}
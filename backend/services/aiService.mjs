// backend/services/aiService.mjs
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const MOCK_MODE = process.env.MOCK_AI === 'true';

// ─── Lazy import for Gemini ────────────────────────────────────────
let GoogleGenAI = null;
if (GEMINI_API_KEY) {
  try {
    const module = await import('@google/genai');
    GoogleGenAI = module.GoogleGenAI;
  } catch {
    console.warn('⚠️ @google/genai not installed. Gemini support disabled.');
  }
}
const geminiClient = GEMINI_API_KEY && GoogleGenAI ? new GoogleGenAI({ apiKey: GEMINI_API_KEY }) : null;

// ─── CONSTANTS ──────────────────────────────────────────────────────
const TOKEN_BUDGET = {
  MAX_TOTAL_CHARS: 120000,
  MAX_FILE_CHARS: 10000,
  MAX_FILES: 40,
  TREE_MAX_FILES: 150,
};

const DEFAULT_FREE_MODELS = [
  'meta-llama/llama-3.3-70b-instruct:free',
  'nvidia/nemotron-3-ultra-550b-a55b:free',
  'poolside/laguna-m.1:free',
  'cohere/north-mini-code:free',
  'openai/gpt-oss-120b:free',
  'qwen/qwen3-next-80b-a3b-instruct:free',
  'google/gemma-4-31b-it:free',
  'nvidia/nemotron-3-super-120b-a12b:free',
  'deepseek/deepseek-chat-v3-0324:free',
  'microsoft/phi-3-medium-128k-instruct:free',
  'google/gemma-2-9b-it:free',
  'mistralai/mistral-7b-instruct:free',
];

let cachedFreeModels = null;
let lastModelFetch = 0;
const MODEL_CACHE_TTL_MS = 1000 * 60 * 30;

// ─── PERSONALITY & SYSTEM PROMPTS ────────────────────────────────

/** New general‑purpose personality for non‑code questions */
const GENERAL_PERSONALITY = `You are a helpful assistant having a natural conversation with a developer.

HOW TO RESPOND:
- Answer the user's question directly and concisely.
- Do NOT analyze, summarize, or reference their codebase.
- Do NOT mention their project, files, or tech stack unless they ask.
- Keep responses conversational and natural.
- If they ask a math question, just give the answer.
- If they say "hello", just greet them back normally.
- Think out loud only when it helps the user understand your reasoning.
- Ask follow‑up questions naturally when you need more info.`;

/** Calm, professional code‑focused personality (toned down from emoji‑heavy version) */
const BASE_SYSTEM = `You are an experienced software engineer pair‑programming with another developer. 
You work inside the BadLson AI Code Editor.

TECH STACK: JavaScript ES6+, TypeScript, React, HTML5, CSS/Tailwind, Node.js, Express.

RULES FOR CODE CHANGES (STRICT):
- Use ONLY \`\`\`edit:FULL_FILE_PATH blocks for code changes.
- Never output raw suggestions as comments.
- Never output "Copy" or "Apply" buttons.
- If you cannot determine the exact change, ask the user.
- Work on ONE file at a time per response.
- After completing a file, say: **File Completed:** filename.
- Explain your reasoning before showing code.
- When fixing bugs, change only the necessary lines — not the whole file.

TONE: Be professional, calm, and focused.`;

const MODE_PROMPTS = {
  code: `${BASE_SYSTEM}\n\nMODE: CODE GENERATION\nYou are writing new code or modifying existing code.\n- Provide complete, working, production‑ready code inside edit blocks.\n- Follow best practices: error handling, type safety, performance.\n- If the request is vague, ask clarifying questions first.`,
  debug: `${BASE_SYSTEM}\n\nMODE: DEBUGGING\nYou are helping fix a bug or error.\n1. First, explain what you think is causing the issue.\n2. Then provide the fix using \`\`\`edit:path format ONLY.\n3. Explain why the fix works.\n4. Suggest how to prevent similar issues.\n\nIf you need error messages, console logs, or specific file content → ask for them.`,
  review: `${BASE_SYSTEM}\n\nMODE: CODE REVIEW\nAnalyze and report on: bugs, security vulnerabilities, performance problems, maintainability, TypeScript type safety.\nFor each issue: explain the problem, show corrected code with \`\`\`edit:path ONLY, explain why it's better.`,
  explain: `${BASE_SYSTEM}\n\nMODE: EXPLANATION\nBreak complex topics into simple steps. Use actual project code as examples. NO edit blocks needed unless user asks for code changes.`,
  design: `${BASE_SYSTEM}\n\nMODE: ARCHITECTURE/DESIGN\nConsider scalability, maintainability, security. Explain tradeoffs. Do NOT write full implementation unless asked.`,
  error: `${BASE_SYSTEM}\n\nMODE: ERROR RESPONSE\nThe user's code has errors. Use provided error info to diagnose, identify root cause, explain what's wrong, provide fix with \`\`\`edit:path ONLY.`,
  general: GENERAL_PERSONALITY,
  generic: BASE_SYSTEM,
};

// ─── MODE DETECTION ────────────────────────────────────────────────

function detectMode(userMessage, context = {}) {
  const msg = userMessage.toLowerCase().trim();

  // GENERAL QUESTIONS — no project context needed
  const generalPatterns = [
    /^hello\b/, /^hi\b/, /^hey\b/, /^how are you\b/,
    /^\d+\s*[\+\-\*\/]\s*\d+/,           // "2 + 2", "5 * 3"
    /what is \d+/, /what's \d+/,         // "what is 2 plus 2"
    /who (is|are|was|were)/,             // "who is..."
    /where (is|are)/, /when (did|was)/,
    /why (is|are|does|do)/,
    /tell me about yourself/, /what can you do/,
    /thank you/, /thanks/,
    /good morning/, /good afternoon/, /good evening/,
    /what's up/, /how's it going/,
    /^(yes|no|maybe|ok|sure|great|cool|nice)\b/,
    /^[a-z]+$/,                          // single word like "hello", "hi"
    /^\s*$/,                             // empty
  ];
  if (generalPatterns.some(p => p.test(msg))) return 'general';

  // If there are errors, prioritize error mode
  if (context.consoleErrors?.length || context.buildErrors?.length) return 'error';
  if (msg.includes('review') || msg.includes('check this code')) return 'review';
  if (msg.includes('explain') || msg.includes('how does') || msg.includes('what is')) return 'explain';
  if (msg.includes('design') || msg.includes('architecture') || msg.includes('structure')) return 'design';
  if (msg.includes('fix') || msg.includes('bug') || msg.includes('error') || msg.includes('broken')) return 'debug';
  if (msg.includes('add') || msg.includes('create') || msg.includes('write') || msg.includes('implement') || msg.includes('change') || msg.includes('update') || msg.includes('refactor')) return 'code';
  return 'generic';
}

// ─── MOCK AI RESPONSES ──────────────────────────────────────────────

const MOCK_RESPONSES = [
  {
    triggers: ['hello', 'hi', 'hey'],
    response: `Hello! 👋 I'm your AI coding assistant. I can help you write code, fix bugs, and explain concepts. Tell me what you need and I'll provide the code in an \`edit:\` block – you can copy it or apply it with the "Apply" button.`,
  },
  {
    triggers: ['how are you'],
    response: `I'm doing great, thanks for asking! 😄 How can I help you with your code today?`,
  },
  {
    triggers: ['what can you do'],
    response: `I can help you write code, debug issues, review your code, explain concepts, and even create wireframes! 🚀`,
  },
  {
    triggers: ['who are you'],
    response: `I'm your AI coding assistant, built to help you with your software development projects! 💻`,
  },
  {
    triggers: ['2 + 2', '2 plus 2'],
    response: `2 + 2 = 4 🧮`,
  },
  {
    triggers: ['thanks', 'thank you'],
    response: `You're welcome! 😊 Let me know if you need anything else!`,
  },
];

function generateMockResponse(message, projectFiles) {
  const msgLower = message.toLowerCase();
  for (const mock of MOCK_RESPONSES) {
    if (mock.triggers.some(t => msgLower.includes(t))) {
      return {
        content: mock.response,
        model: 'mock-ai',
        provider: 'mock',
      };
    }
  }
  const fileCount = Object.keys(projectFiles).length;
  const fileList = Object.keys(projectFiles).slice(0, 3).join(', ');
  return {
    content: `I can help you with your project (${fileCount} files${fileList ? ` including ${fileList}` : ''}). Tell me what code you need or what problem you're facing.`,
    model: 'mock-ai',
    provider: 'mock',
  };
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
    const contentWordSet = new Set(contentLower.split(/\W+/).filter(w => w.length > 2));
    
    if (activeFile && (filename === activeFile || fileLower.includes(activeFile.toLowerCase()))) score += 2000;
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

export function buildPrompt(projectFiles, userMessage, options = {}) {
  const {
    activeFile = null, recentFiles = [], consoleErrors = [], buildErrors = [],
    cursorPosition = null, selectedCode = null, chatHistory = [],
  } = options;

  const mode = detectMode(userMessage, { consoleErrors, buildErrors });
  
  // ─── GENERAL MODE: zero project context ──────────────────────────
  if (mode === 'general') {
    const messages = [{ role: 'system', content: GENERAL_PERSONALITY }];
    const trimmedHistory = chatHistory.slice(-6);
    for (const msg of trimmedHistory) {
      messages.push({ role: msg.role === 'user' ? 'user' : 'assistant', content: msg.content });
    }
    messages.push({ role: 'user', content: userMessage });
    return { messages, mode };
  }

  // ─── CODE MODE: full context ──────────────────────────────────────
  const systemPrompt = MODE_PROMPTS[mode] || MODE_PROMPTS.generic;
  const fileEntries = Object.entries(projectFiles);

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
    if (cursorPosition) contextParts.push(`Cursor at line ${cursorPosition.line}, column ${cursorPosition.column}`);
    if (selectedCode) contextParts.push(`SELECTED CODE:\n\`\`\`\n${selectedCode}\n\`\`\``);
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
    messages.push({ role: msg.role === 'user' ? 'user' : 'assistant', content: msg.content });
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
    return merged;
  } catch (error) {
    console.warn('Error fetching OpenRouter models:', error.message);
    return DEFAULT_FREE_MODELS;
  }
}

export async function getAvailableModels() {
  const freeModels = await fetchOpenRouterFreeModels();
  const hasValidOpenRouter = OPENROUTER_API_KEY && OPENROUTER_API_KEY !== 'sk' && OPENROUTER_API_KEY.length > 10;
  const hasValidGroq = GROQ_API_KEY && GROQ_API_KEY !== 'gsk_Qr3N' && GROQ_API_KEY.length > 10;
  const hasValidGemini = GEMINI_API_KEY && GEMINI_API_KEY !== 'AQ.Ab' && GEMINI_API_KEY.length > 10;

  return {
    openrouter: {
      status: hasValidOpenRouter ? 'ok' : 'not_configured',
      models: freeModels,
    },
    groq: {
      status: hasValidGroq ? 'ok' : 'not_configured',
      models: ['meta-llama/llama-4-scout-17b-16e-instruct'],
    },
    gemini: {
      status: hasValidGemini && geminiClient ? 'ok' : 'not_configured',
      models: ['gemini-2.5-flash', 'gemini-2.5-pro'],
    },
  };
}

// ─── OPENROUTER API CALLS ──────────────────────────────────────────

async function callOpenRouter(messages, preferredModel = null) {
  if (!OPENROUTER_API_KEY || OPENROUTER_API_KEY === 'sk' || OPENROUTER_API_KEY.length < 10) {
    if (MOCK_MODE) {
      console.log('[AI Service] 🎭 Mock mode enabled (invalid API key)');
      const userMessage = messages.find(m => m.role === 'user')?.content || 'Hello';
      return {
        content: generateMockResponse(userMessage, {}),
        model: 'mock',
        provider: 'mock'
      };
    }
    throw new Error('OPENROUTER_API_KEY not configured properly. Please set a valid API key.');
  }

  if (MOCK_MODE) {
    console.log('[AI Service] 🎭 Mock mode enabled');
    const userMessage = messages.find(m => m.role === 'user')?.content || 'Hello';
    return {
      content: generateMockResponse(userMessage, {}),
      model: 'mock',
      provider: 'mock'
    };
  }

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
      lastError = error;
    }
  }

  throw lastError || new Error('All OpenRouter models failed');
}

// ─── OPENROUTER STREAMING ──────────────────────────────────────────

async function streamOpenRouter(messages, onChunk, preferredModel = null) {
  if (!OPENROUTER_API_KEY || OPENROUTER_API_KEY === 'sk' || OPENROUTER_API_KEY.length < 10) {
    if (MOCK_MODE) {
      console.log('[AI Service] 🎭 Mock streaming mode enabled (invalid API key)');
      const userMessage = messages.find(m => m.role === 'user')?.content || 'Hello';
      const mockResponse = generateMockResponse(userMessage, {});
      
      const chunks = mockResponse.content.split(' ');
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i] + (i < chunks.length - 1 ? ' ' : '');
        onChunk(chunk);
        await new Promise(r => setTimeout(r, 20));
      }
      
      return {
        content: mockResponse.content,
        model: 'mock',
        provider: 'mock'
      };
    }
    throw new Error('OPENROUTER_API_KEY not configured properly. Please set a valid API key.');
  }

  if (MOCK_MODE) {
    console.log('[AI Service] 🎭 Mock streaming mode enabled');
    const userMessage = messages.find(m => m.role === 'user')?.content || 'Hello';
    const mockResponse = generateMockResponse(userMessage, {});
    
    const chunks = mockResponse.content.split(' ');
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i] + (i < chunks.length - 1 ? ' ' : '');
      onChunk(chunk);
      await new Promise(r => setTimeout(r, 20));
    }
    
    return {
      content: mockResponse.content,
      model: 'mock',
      provider: 'mock'
    };
  }

  const freeModels = await fetchOpenRouterFreeModels();
  const modelsToTry = preferredModel
    ? [preferredModel, ...freeModels.filter(m => m !== preferredModel)]
    : freeModels;

  let lastError;
  for (const model of modelsToTry) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 90000);

      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        signal: controller.signal,
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

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        if ([429, 503, 404, 402].includes(response.status)) {
          lastError = new Error(`OpenRouter ${model}: ${errorText.substring(0, 200)}`);
          continue;
        }
        throw new Error(`OpenRouter streaming error ${response.status}: ${errorText.substring(0, 500)}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';
      let actualModel = model;
      let chunkReceived = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(line => line.trim().startsWith('data:'));

        for (const line of lines) {
          const data = line.replace('data:', '').trim();
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            if (parsed.model) actualModel = parsed.model;

            if (parsed.error) {
              throw new Error(`OpenRouter stream error: ${JSON.stringify(parsed.error)}`);
            }

            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              fullText += content;
              chunkReceived = true;
              if (onChunk) onChunk(content);
            }
          } catch (parseErr) {
            if (parseErr.message?.includes('OpenRouter stream error')) throw parseErr;
          }
        }
      }

      if (!chunkReceived) {
        throw new Error(`OpenRouter stream completed but no content chunks received for model ${model}`);
      }

      return {
        content: cleanResponse(fullText),
        model: actualModel,
        provider: 'openrouter',
      };
    } catch (error) {
      if (error.name === 'AbortError') {
        lastError = new Error(`Timeout waiting for OpenRouter model ${model}`);
      } else {
        lastError = error;
      }
    }
  }

  throw lastError || new Error('All OpenRouter stream models failed');
}

// ─── GROQ ─────────────────────────────────────────────────────────

async function callGroq(messages, model = 'meta-llama/llama-4-scout-17b-16e-instruct') {
  if (!GROQ_API_KEY || GROQ_API_KEY === 'gsk_Qr3N' || GROQ_API_KEY.length < 10) {
    if (MOCK_MODE) {
      console.log('[AI Service] 🎭 Mock mode enabled (invalid GROQ key)');
      const userMessage = messages.find(m => m.role === 'user')?.content || 'Hello';
      return {
        content: generateMockResponse(userMessage, {}),
        model: 'mock',
        provider: 'mock'
      };
    }
    throw new Error('GROQ_API_KEY not configured properly. Please set a valid API key.');
  }

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model, messages, temperature: 0.3, max_tokens: 8192 }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Groq API error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  if (!data.choices?.[0]?.message?.content) throw new Error('Invalid response from Groq');

  return { content: data.choices[0].message.content, model: data.model || model, provider: 'groq' };
}

async function streamGroq(messages, onChunk) {
  if (!GROQ_API_KEY || GROQ_API_KEY === 'gsk_Qr3N' || GROQ_API_KEY.length < 10) {
    if (MOCK_MODE) {
      console.log('[AI Service] 🎭 Mock streaming mode enabled (invalid GROQ key)');
      const userMessage = messages.find(m => m.role === 'user')?.content || 'Hello';
      const mockResponse = generateMockResponse(userMessage, {});
      
      const chunks = mockResponse.content.split(' ');
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i] + (i < chunks.length - 1 ? ' ' : '');
        onChunk(chunk);
        await new Promise(r => setTimeout(r, 20));
      }
      
      return {
        content: mockResponse.content,
        model: 'mock',
        provider: 'mock'
      };
    }
    throw new Error('GROQ_API_KEY not configured properly. Please set a valid API key.');
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
      temperature: 0.3,
      max_tokens: 8192,
      stream: true,
    }),
  });

  if (!response.ok) throw new Error(`Groq streaming error: ${response.status}`);

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

  return { content: cleanResponse(fullText), model: 'meta-llama/llama-4-scout-17b-16e-instruct', provider: 'groq' };
}

// ─── GEMINI ─────────────────────────────────────────────────────────

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

async function callGemini(messages, model = 'gemini-2.5-flash') {
  if (!geminiClient) {
    if (MOCK_MODE) {
      console.log('[AI Service] 🎭 Mock mode enabled (Gemini not available)');
      const userMessage = messages.find(m => m.role === 'user')?.content || 'Hello';
      return {
        content: generateMockResponse(userMessage, {}),
        model: 'mock',
        provider: 'mock'
      };
    }
    throw new Error('GEMINI_API_KEY not configured or @google/genai not installed');
  }

  const userMessages = messages.filter(m => m.role !== 'system');
  const fullPrompt = GEMINI_SYSTEM + '\n\n=== PROJECT CONTEXT ===\n' + 
    userMessages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n');

  const result = await geminiClient.models.generateContent({
    model,
    contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
    config: { maxOutputTokens: 8192, temperature: 0.1, topP: 0.1 },
  });

  let text = result.text || result.candidates?.[0]?.content?.parts?.[0]?.text || '';
  if (!text || text.trim().length === 0) {
    throw new Error(`Gemini empty response. Finish reason: ${result.candidates?.[0]?.finishReason || 'unknown'}`);
  }

  return { content: text, model, provider: 'gemini' };
}

async function streamGemini(messages, onChunk, model = 'gemini-2.5-flash') {
  if (!geminiClient) {
    if (MOCK_MODE) {
      console.log('[AI Service] 🎭 Mock streaming mode enabled (Gemini not available)');
      const userMessage = messages.find(m => m.role === 'user')?.content || 'Hello';
      const mockResponse = generateMockResponse(userMessage, {});
      
      const chunks = mockResponse.content.split(' ');
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i] + (i < chunks.length - 1 ? ' ' : '');
        onChunk(chunk);
        await new Promise(r => setTimeout(r, 20));
      }
      
      return {
        content: mockResponse.content,
        model: 'mock',
        provider: 'mock'
      };
    }
    throw new Error('GEMINI_API_KEY not configured or @google/genai not installed');
  }

  const userMessages = messages.filter(m => m.role !== 'system');
  const fullPrompt = GEMINI_SYSTEM + '\n\n=== PROJECT CONTEXT ===\n' + 
    userMessages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n');

  const result = await geminiClient.models.generateContentStream({
    model,
    contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
    config: { maxOutputTokens: 8192, temperature: 0.1, topP: 0.1 },
  });

  let fullText = '';
  for await (const chunk of result) {
    let text = chunk.text || chunk.candidates?.[0]?.content?.parts?.[0]?.text || '';
    if (text) {
      fullText += text;
      if (onChunk) onChunk(text);
    }
  }

  if (!fullText || fullText.trim().length === 0) {
    throw new Error('Gemini streaming returned no content.');
  }

  return { content: cleanResponse(fullText), model, provider: 'gemini' };
}

// ─── MOCK AI ────────────────────────────────────────────────────────

async function callMockAI(messages, projectFiles = {}) {
  const userMessage = messages.filter(m => m.role === 'user').pop()?.content || '';
  return generateMockResponse(userMessage, projectFiles);
}

async function streamMockAI(messages, onChunk, projectFiles = {}) {
  const userMessage = messages.filter(m => m.role === 'user').pop()?.content || '';
  const response = generateMockResponse(userMessage, projectFiles);
  
  const chunks = response.content.split(/(?=[.!?]\s+)/);
  for (const chunk of chunks) {
    if (onChunk) onChunk(chunk);
    await new Promise(r => setTimeout(r, 50));
  }
  
  return response;
}

// ─── STREAM WITH FALLBACK ──────────────────────────────────────────

export async function streamWithFallback(messages, onChunk, preferredProvider = 'openrouter', preferredModel = null, projectFiles = {}) {
  if (MOCK_MODE) {
    return await streamMockAI(messages, onChunk, projectFiles);
  }

  const providers = [];
  
  const hasValidOpenRouter = OPENROUTER_API_KEY && OPENROUTER_API_KEY !== 'sk' && OPENROUTER_API_KEY.length > 10;
  const hasValidGroq = GROQ_API_KEY && GROQ_API_KEY !== 'gsk_Qr3N' && GROQ_API_KEY.length > 10;
  const hasValidGemini = GEMINI_API_KEY && GEMINI_API_KEY !== 'AQ.Ab' && GEMINI_API_KEY.length > 10 && geminiClient;

  if (preferredProvider === 'openrouter' && hasValidOpenRouter) providers.push('openrouter');
  if (preferredProvider === 'groq' && hasValidGroq) providers.push('groq');
  if (preferredProvider === 'gemini' && hasValidGemini) providers.push('gemini');

  if (hasValidOpenRouter && !providers.includes('openrouter')) providers.push('openrouter');
  if (hasValidGroq && !providers.includes('groq')) providers.push('groq');
  if (hasValidGemini && !providers.includes('gemini')) providers.push('gemini');

  if (providers.length === 0) {
    if (MOCK_MODE) {
      console.log('[AI Service] 🎭 Mock mode enabled (no valid providers)');
      const userMessage = messages.find(m => m.role === 'user')?.content || 'Hello';
      const mockResponse = generateMockResponse(userMessage, projectFiles);
      
      const chunks = mockResponse.content.split(' ');
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i] + (i < chunks.length - 1 ? ' ' : '');
        onChunk(chunk);
        await new Promise(r => setTimeout(r, 20));
      }
      
      return {
        content: mockResponse.content,
        model: 'mock',
        provider: 'mock'
      };
    }
    throw new Error('No AI provider API keys configured. Set OPENROUTER_API_KEY, GROQ_API_KEY, or GEMINI_API_KEY in backend/.env');
  }

  let lastError;
  for (const provider of providers) {
    try {
      let result;
      if (provider === 'openrouter') result = await streamOpenRouter(messages, onChunk, preferredModel);
      else if (provider === 'groq') result = await streamGroq(messages, onChunk);
      else if (provider === 'gemini') result = await streamGemini(messages, onChunk, preferredModel);
      return result;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('All AI provider streams failed');
}

// ─── CALL WITH FALLBACK ────────────────────────────────────────────

export async function callWithFallback(messages, preferredProvider = 'openrouter', preferredModel = null, projectFiles = {}) {
  if (MOCK_MODE) {
    return await callMockAI(messages, projectFiles);
  }

  const providers = [];
  
  const hasValidOpenRouter = OPENROUTER_API_KEY && OPENROUTER_API_KEY !== 'sk' && OPENROUTER_API_KEY.length > 10;
  const hasValidGroq = GROQ_API_KEY && GROQ_API_KEY !== 'gsk_Qr3N' && GROQ_API_KEY.length > 10;
  const hasValidGemini = GEMINI_API_KEY && GEMINI_API_KEY !== 'AQ.Ab' && GEMINI_API_KEY.length > 10 && geminiClient;

  if (preferredProvider === 'openrouter' && hasValidOpenRouter) providers.push('openrouter');
  if (preferredProvider === 'groq' && hasValidGroq) providers.push('groq');
  if (preferredProvider === 'gemini' && hasValidGemini) providers.push('gemini');

  if (hasValidOpenRouter && !providers.includes('openrouter')) providers.push('openrouter');
  if (hasValidGroq && !providers.includes('groq')) providers.push('groq');
  if (hasValidGemini && !providers.includes('gemini')) providers.push('gemini');

  if (providers.length === 0) {
    if (MOCK_MODE) {
      console.log('[AI Service] 🎭 Mock mode enabled (no valid providers)');
      const userMessage = messages.find(m => m.role === 'user')?.content || 'Hello';
      return {
        content: generateMockResponse(userMessage, projectFiles),
        model: 'mock',
        provider: 'mock'
      };
    }
    throw new Error('No AI provider API keys configured. Set OPENROUTER_API_KEY, GROQ_API_KEY, or GEMINI_API_KEY in backend/.env');
  }

  let lastError;
  for (const provider of providers) {
    try {
      if (provider === 'openrouter') return await callOpenRouter(messages, preferredModel);
      if (provider === 'groq') return await callGroq(messages, preferredModel);
      if (provider === 'gemini') return await callGemini(messages, preferredModel);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('All AI providers failed');
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

  const editPattern = /```edit:([^\n]+)\n([\s\S]*?)```/g;
  const edits = [];
  let match;
  while ((match = editPattern.exec(cleaned)) !== null) {
    const existing = edits.find(e => e.filename === match[1].trim() && e.code === match[2].trim());
    if (!existing) edits.push({ filename: match[1].trim(), code: match[2].trim() });
  }

  const patchPattern = /```patch:([^\n]+)\n([\s\S]*?)```/g;
  const patches = [];
  while ((match = patchPattern.exec(cleaned)) !== null) {
    patches.push({ filename: match[1].trim(), diff: match[2].trim() });
  }

  const wireframePattern = /```wireframe:([^\n]+)\n([\s\S]*?)```/g;
  const wireframes = [];
  while ((match = wireframePattern.exec(cleaned)) !== null) {
    wireframes.push({ title: match[1].trim(), content: match[2].trim() });
  }

  if (edits.length === 0 && patches.length === 0) {
    const codeBlockRegex = /```(?:html|css|js|ts|tsx|jsx|javascript|typescript)\n([\s\S]*?)```/g;
    let match;
    while ((match = codeBlockRegex.exec(cleaned)) !== null) {
      const filename = guessFilenameFromContext(cleaned, match[1]);
      if (filename) edits.push({ filename, code: match[1].trim() });
    }
  }

  const fileCompletedRegex = /\*\*File Completed:\s*([^\n]+)\*\*/i;
  const completedMatch = cleaned.match(fileCompletedRegex);

  let message = cleaned;
  const allPatterns = [editPattern, patchPattern, wireframePattern, /```(?:html|css|js|ts|tsx|jsx|javascript|typescript)\n([\s\S]*?)```/g];
  for (const pattern of allPatterns) {
    message = message.replace(pattern, '');
  }
  message = message.replace(/\*\*File Completed:[^\n]*\*\*/gi, '').replace(/\n{3,}/g, '\n\n').trim();

  let detectedMode = 'generic';
  if (message.includes('BUG:') || message.includes('FIX:')) detectedMode = 'debug';
  else if (message.includes('REVIEW:') || message.includes('ISSUE:')) detectedMode = 'review';
  else if (message.includes('EXPLANATION:')) detectedMode = 'explain';
  else if (edits.length > 0) detectedMode = 'code';

  return { message, edits, patches, wireframes, mode: detectedMode, completedFile: completedMatch?.[1]?.trim() };
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

// ─── UNIFIED DIFF PATCH APPLICATION ─────────────────────────────────

function applyPatch(originalContent, diffText) {
  const lines = originalContent.split('\n');
  const diffLines = diffText.split('\n');
  
  let result = [];
  let i = 0;
  let inHunk = false;
  let oldStart = 0;
  let oldCount = 0;
  let newStart = 0;
  let newCount = 0;
  let lineIdx = 0;
  
  for (const line of diffLines) {
    if (line.startsWith('@@')) {
      const match = line.match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
      if (match) {
        oldStart = parseInt(match[1]) - 1;
        oldCount = parseInt(match[2] || '1');
        newStart = parseInt(match[3]) - 1;
        newCount = parseInt(match[4] || '1');
        lineIdx = oldStart;
        inHunk = true;
        
        while (result.length < oldStart) {
          result.push(lines[result.length]);
        }
      }
      continue;
    }
    
    if (!inHunk) continue;
    
    if (line.startsWith(' ')) {
      result.push(line.substring(1));
      lineIdx++;
    } else if (line.startsWith('-')) {
      lineIdx++;
    } else if (line.startsWith('+')) {
      result.push(line.substring(1));
    } else if (line === '\\ No newline at end of file') {
      // ignore
    }
  }
  
  while (lineIdx < lines.length) {
    result.push(lines[lineIdx]);
    lineIdx++;
  }
  
  return result.join('\n');
}

// ─── SMART EDIT APPLICATION ────────────────────────────────────────

export function applyEdits(projectFiles, edits, patches = [], options = {}) {
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
    }
  }

  for (const patch of patches) {
    const { filename, diff } = patch;
    
    if (!updatedFiles.hasOwnProperty(filename)) {
      failed.push({ filename, reason: 'File does not exist for patch' });
      continue;
    }

    try {
      const original = updatedFiles[filename];
      const patched = applyPatch(original, diff);
      
      if (patched !== original) {
        updatedFiles[filename] = patched;
        applied.push({ filename, type: 'patched' });
      } else {
        failed.push({ filename, reason: 'Patch did not change file content' });
      }
    } catch (error) {
      failed.push({ filename, reason: `Patch application failed: ${error.message}` });
    }
  }

  return { updatedFiles, applied, failed };
}

function smartApplyEdit(original, newCode, isActiveFile) {
  if (newCode.includes('<!DOCTYPE') || newCode.includes('<html')) {
    return { success: true, type: 'replaced', content: newCode };
  }

  const originalLines = original.split('\n');
  const newLines = newCode.split('\n');

  if (newLines.length < 3) {
    return { success: true, type: 'replaced', content: newCode };
  }

  const commonStart = findCommonStart(originalLines, newLines);
  const commonEnd = findCommonEnd(originalLines, newLines, commonStart);

  if (commonStart >= 3 || (commonStart >= 2 && commonEnd >= 2)) {
    const merged = [
      ...originalLines.slice(0, originalLines.length - commonEnd),
      ...newLines.slice(commonStart, newLines.length - commonEnd),
      ...originalLines.slice(originalLines.length - commonEnd),
    ];
    return { success: true, type: 'patched', content: merged.join('\n') };
  }

  if (isActiveFile) {
    return { success: true, type: 'replaced', content: newCode };
  }

  return { success: false, reason: 'Could not safely merge changes', content: original };
}

function findCommonStart(a, b) {
  let i = 0;
  while (i < Math.min(a.length, b.length) && a[i].trim() === b[i].trim()) i++;
  return i;
}

function findCommonEnd(a, b, startOffset) {
  let i = 0;
  while (
    i < Math.min(a.length - startOffset, b.length - startOffset) &&
    a[a.length - 1 - i].trim() === b[b.length - 1 - i].trim()
  ) i++;
  return i;
}

// ─── SMART LINE-SPECIFIC EDITS ──────────────────────────────────────

export function applySmartEdits(projectFiles, edits) {
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
    const lineChanges = extractLineChanges(code);
    
    if (lineChanges.length > 0) {
      const result = applyLineSpecificEdits(original, lineChanges);
      if (result.success) {
        updatedFiles[filename] = result.content;
        applied.push({ filename, type: 'line-edits', changes: lineChanges.length });
      } else {
        updatedFiles[filename] = code;
        applied.push({ filename, type: 'replaced-full' });
      }
    } else {
      const similarity = calculateSimilarity(original, code);
      if (similarity > 0.7) {
        const result = smartMerge(original, code);
        if (result.success) {
          updatedFiles[filename] = result.content;
          applied.push({ filename, type: 'smart-merge' });
        } else {
          updatedFiles[filename] = code;
          applied.push({ filename, type: 'replaced-full' });
        }
      } else {
        updatedFiles[filename] = code;
        applied.push({ filename, type: 'replaced-full' });
      }
    }
  }

  return { updatedFiles, applied, failed };
}

function extractLineChanges(code) {
  const changes = [];
  const lines = code.split('\n');
  let currentChange = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    const changedMatch = trimmed.match(/\/\/\s*✅?\s*CHANGED:?\s*(?:line\s*)?(\d+)(?:-(\d+))?/i);
    const addedMatch = trimmed.match(/\/\/\s*✅?\s*ADDED:?\s*(?:line\s*)?(\d+)(?:-(\d+))?/i);
    const removedMatch = trimmed.match(/\/\/\s*✅?\s*REMOVED:?\s*(?:line\s*)?(\d+)(?:-(\d+))?/i);
    
    if (changedMatch || addedMatch || removedMatch) {
      if (currentChange) {
        changes.push(currentChange);
      }
      const match = changedMatch || addedMatch || removedMatch;
      const type = changedMatch ? 'changed' : addedMatch ? 'added' : 'removed';
      const startLine = parseInt(match[1]);
      const endLine = match[2] ? parseInt(match[2]) : startLine;
      
      currentChange = {
        type,
        startLine,
        endLine,
        content: [],
        originalLines: []
      };
      continue;
    }
    
    if (currentChange) {
      currentChange.content.push(line);
    }
  }
  
  if (currentChange) {
    changes.push(currentChange);
  }
  
  return changes;
}

function applyLineSpecificEdits(original, changes) {
  const originalLines = original.split('\n');
  let resultLines = [...originalLines];
  let success = true;

  const sortedChanges = changes.sort((a, b) => b.startLine - a.startLine);

  for (const change of sortedChanges) {
    try {
      const startIdx = Math.max(0, change.startLine - 1);
      const endIdx = Math.min(originalLines.length, change.endLine);
      
      if (change.type === 'removed') {
        resultLines.splice(startIdx, endIdx - startIdx + 1);
      } else if (change.type === 'changed') {
        const newContent = change.content.join('\n');
        resultLines.splice(startIdx, endIdx - startIdx + 1, newContent);
      } else if (change.type === 'added') {
        const newContent = change.content.join('\n');
        resultLines.splice(startIdx + 1, 0, newContent);
      }
    } catch (error) {
      success = false;
      console.warn(`[AI] Line edit failed for lines ${change.startLine}-${change.endLine}:`, error.message);
    }
  }

  return {
    success,
    content: resultLines.join('\n')
  };
}

function calculateSimilarity(str1, str2) {
  const maxLen = Math.max(str1.length, str2.length);
  if (maxLen === 0) return 1;
  
  let matches = 0;
  const minLen = Math.min(str1.length, str2.length);
  for (let i = 0; i < minLen; i++) {
    if (str1[i] === str2[i]) matches++;
  }
  return matches / maxLen;
}

function smartMerge(original, newVersion) {
  const originalLines = original.split('\n');
  const newLines = newVersion.split('\n');
  
  let commonStart = 0;
  while (commonStart < Math.min(originalLines.length, newLines.length) && 
         originalLines[commonStart] === newLines[commonStart]) {
    commonStart++;
  }
  
  let commonEnd = 0;
  while (commonEnd < Math.min(originalLines.length - commonStart, newLines.length - commonStart) &&
         originalLines[originalLines.length - 1 - commonEnd] === newLines[newLines.length - 1 - commonEnd]) {
    commonEnd++;
  }
  
  if (commonStart > 0 || commonEnd > 0) {
    const merged = [
      ...originalLines.slice(0, commonStart),
      ...newLines.slice(commonStart, newLines.length - commonEnd),
      ...originalLines.slice(originalLines.length - commonEnd)
    ];
    return { success: true, content: merged.join('\n') };
  }
  
  return { success: false };
}

// ─── TEST CONNECTION ────────────────────────────────────────────────

export async function testConnection() {
  const results = {
    openrouter: { status: 'not_configured' },
    groq: { status: 'not_configured' },
    gemini: { status: 'not_configured' },
  };

  const hasValidOpenRouter = OPENROUTER_API_KEY && OPENROUTER_API_KEY !== 'sk' && OPENROUTER_API_KEY.length > 10;
  const hasValidGroq = GROQ_API_KEY && GROQ_API_KEY !== 'gsk_Qr3N' && GROQ_API_KEY.length > 10;
  const hasValidGemini = GEMINI_API_KEY && GEMINI_API_KEY !== 'AQ.Ab' && GEMINI_API_KEY.length > 10 && geminiClient;

  if (hasValidOpenRouter) {
    try {
      const response = await fetch('https://openrouter.ai/api/v1/auth/key', {
        headers: { 'Authorization': `Bearer ${OPENROUTER_API_KEY}` },
      });
      results.openrouter = {
        status: response.ok ? 'ok' : 'error',
        statusCode: response.status,
      };
    } catch (err) {
      results.openrouter = { status: 'error', message: err.message };
    }
  }

  if (hasValidGroq) {
    try {
      const response = await fetch('https://api.groq.com/openai/v1/models', {
        headers: { 'Authorization': `Bearer ${GROQ_API_KEY}` },
      });
      results.groq = {
        status: response.ok ? 'ok' : 'error',
        statusCode: response.status,
      };
    } catch (err) {
      results.groq = { status: 'error', message: err.message };
    }
  }

  if (hasValidGemini) {
    try {
      const result = await geminiClient.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts: [{ text: 'Hi' }] }],
        config: { maxOutputTokens: 10 },
      });
      results.gemini = {
        status: result.text ? 'ok' : 'error',
      };
    } catch (err) {
      results.gemini = { status: 'error', message: err.message };
    }
  }

  if (!hasValidOpenRouter && !hasValidGroq && !hasValidGemini && MOCK_MODE) {
    results.openrouter = { status: 'ok', message: 'Mock mode enabled' };
  }

  return results;
}
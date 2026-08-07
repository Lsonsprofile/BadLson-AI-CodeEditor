// backend/controllers/aiController.mjs
import {
  buildPrompt,
  callWithFallback,
  streamWithFallback,
  parseAiResponse,
  applyEdits,
} from '../services/aiService.mjs';

// ─── CONTEXT BUILDER ────────────────────────────────────────────────
function buildFileContext(projectFiles, activeFile, recentFiles = []) {
  const context = {
    fileCount: Object.keys(projectFiles).length,
    activeFile,
    recentFiles,
    htmlStructure: null,
    importGraph: {},
    fileTypes: {},
  };

  for (const filename of Object.keys(projectFiles)) {
    const ext = filename.split('.').pop();
    context.fileTypes[ext] = (context.fileTypes[ext] || 0) + 1;
  }

  if (projectFiles['index.html']) {
    context.htmlStructure = analyzeHtmlStructure(projectFiles['index.html']);
  }

  context.importGraph = buildImportGraph(projectFiles);
  return context;
}

function analyzeHtmlStructure(htmlContent) {
  const structure = {
    doctype: htmlContent.includes('<!DOCTYPE') || htmlContent.includes('<!doctype'),
    title: null,
    metaTags: [],
    scripts: [],
    stylesheets: [],
    bodyClasses: [],
    mainSections: [],
    depth: 0,
  };

  const titleMatch = htmlContent.match(/<title[^>]*>([^<]*)<\/title>/i);
  if (titleMatch) structure.title = titleMatch[1];

  const metaMatches = htmlContent.matchAll(/<meta[^>]*>/gi);
  for (const match of metaMatches) {
    const nameMatch = match[0].match(/name=["']([^"']+)["']/i);
    const contentMatch = match[0].match(/content=["']([^"']+)["']/i);
    if (nameMatch && contentMatch) {
      structure.metaTags.push({ name: nameMatch[1], content: contentMatch[1] });
    }
  }

  const scriptMatches = htmlContent.matchAll(/<script[^>]*src=["']([^"']+)["'][^>]*>/gi);
  for (const match of scriptMatches) {
    structure.scripts.push(match[1]);
  }

  const linkMatches = htmlContent.matchAll(/<link[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/gi);
  for (const match of linkMatches) {
    structure.stylesheets.push(match[1]);
  }

  const bodyMatch = htmlContent.match(/<body[^>]*class=["']([^"']+)["'][^>]*>/i);
  if (bodyMatch) {
    structure.bodyClasses = bodyMatch[1].split(/\s+/);
  }

  const mainTags = ['header', 'nav', 'main', 'section', 'article', 'aside', 'footer', 'div'];
  for (const tag of mainTags) {
    const count = (htmlContent.match(new RegExp(`<${tag}[\\s>]`, 'gi')) || []).length;
    if (count > 0) {
      structure.mainSections.push({ tag, count });
    }
  }

  let maxDepth = 0, currentDepth = 0;
  const tagPattern = /<\/?([a-zA-Z][a-zA-Z0-9]*)[^>]*>/g;
  let m;
  while ((m = tagPattern.exec(htmlContent)) !== null) {
    if (!m[0].startsWith('</')) {
      currentDepth++;
      maxDepth = Math.max(maxDepth, currentDepth);
    } else {
      currentDepth = Math.max(0, currentDepth - 1);
    }
  }
  structure.depth = maxDepth;

  return structure;
}

function buildImportGraph(projectFiles) {
  const graph = {};
  const importRegex = /(?:import|require)\s*\(?['"]([^'"]+)['"]\)?/g;

  for (const [filename, content] of Object.entries(projectFiles)) {
    graph[filename] = { imports: [], importedBy: [] };
    let match;
    while ((match = importRegex.exec(content)) !== null) {
      const importPath = match[1];
      if (importPath.startsWith('.')) {
        graph[filename].imports.push(importPath);
      }
    }
  }

  for (const [filename, data] of Object.entries(graph)) {
    for (const importPath of data.imports) {
      const resolved = resolveImportPath(filename, importPath, Object.keys(projectFiles));
      if (resolved && graph[resolved]) {
        graph[resolved].importedBy.push(filename);
      }
    }
  }

  return graph;
}

function resolveImportPath(fromFile, importPath, allFiles) {
  const dir = fromFile.includes('/') ? fromFile.substring(0, fromFile.lastIndexOf('/') + 1) : '';
  const candidates = [
    dir + importPath,
    dir + importPath + '.js',
    dir + importPath + '.ts',
    dir + importPath + '.tsx',
    dir + importPath + '.jsx',
    dir + importPath + '/index.js',
    dir + importPath + '/index.ts',
    dir + importPath + '/index.tsx',
  ];
  return candidates.find(c => allFiles.includes(c)) || null;
}

// ─── CONTEXT ENHANCEMENT BUILDER ────────────────────────────────────

function buildContextEnhancement(fileContext, projectFiles) {
  const parts = [];

  parts.push('=== PROJECT ANALYSIS ===');

  const typeSummary = Object.entries(fileContext.fileTypes)
    .map(([ext, count]) => `${ext}: ${count}`)
    .join(', ');
  parts.push(`File types: ${typeSummary} (total: ${fileContext.fileCount})`);

  if (fileContext.htmlStructure) {
    const html = fileContext.htmlStructure;
    parts.push(`\nHTML Structure Analysis:`);
    parts.push(`  Title: ${html.title || '(no title)'}`);
    parts.push(`  DOCTYPE: ${html.doctype ? 'Yes' : 'No'}`);
    parts.push(`  Meta tags: ${html.metaTags.length}`);
    parts.push(`  Scripts: ${html.scripts.join(', ') || 'None external'}`);
    parts.push(`  Stylesheets: ${html.stylesheets.join(', ') || 'None external'}`);
    parts.push(`  Body classes: ${html.bodyClasses.join(', ') || 'None'}`);
    parts.push(`  Main sections: ${html.mainSections.map(s => `${s.tag}(${s.count})`).join(', ')}`);
    parts.push(`  Approx DOM depth: ${html.depth}`);
  }

  const heavilyImported = Object.entries(fileContext.importGraph)
    .filter(([_, data]) => data.importedBy.length > 2)
    .map(([file, data]) => `${file} (imported by ${data.importedBy.length} files)`);

  if (heavilyImported.length > 0) {
    parts.push(`\nKey shared modules: ${heavilyImported.join(', ')}`);
  }

  if (fileContext.activeFile && projectFiles[fileContext.activeFile]) {
    const content = projectFiles[fileContext.activeFile];
    const lines = content.split('\n').length;
    parts.push(`\nCurrently editing: ${fileContext.activeFile} (${lines} lines)`);

    if (content.includes('import React')) {
      parts.push('  Type: React component');
    } else if (content.includes('export default function') || content.includes('export function')) {
      parts.push('  Type: Function module');
    } else if (content.includes('interface ') || content.includes('type ')) {
      parts.push('  Type: Type definitions');
    }

    const hooks = ['useState', 'useEffect', 'useContext', 'useReducer', 'useMemo', 'useCallback', 'useRef'];
    const usedHooks = hooks.filter(h => content.includes(h));
    if (usedHooks.length > 0) {
      parts.push(`  React hooks: ${usedHooks.join(', ')}`);
    }
  }

  parts.push('=== END PROJECT ANALYSIS ===');

  return parts.join('\n');
}

// ─── FALLBACK EXTRACTION ───────────────────────────────────────────

function extractCodeFromMessage(message) {
  const blocks = [];
  const codeBlockRegex = /```(?:html|css|js|javascript|ts|tsx|jsx|json|text)?\n([\s\S]*?)```/g;
  let match;
  while ((match = codeBlockRegex.exec(message)) !== null) {
    const code = match[1].trim();
    if (!code) continue;
    const filename = guessFilenameFromContext(message, code);
    if (filename) {
      blocks.push({ filename, code });
    }
  }
  return blocks;
}

function guessFilenameFromContext(text, code) {
  const fileMatch = text.match(/(?:file|update|change|create|modify)\s+['"]?([^\s'"]+\.(html|css|js|ts|tsx|jsx|json))['"]?/i);
  if (fileMatch) return fileMatch[1];
  if (code.includes('<!DOCTYPE') || code.includes('<html')) return 'index.html';
  if (code.includes('@tailwind') || code.includes(':root {') || code.includes('@import')) return 'styles.css';
  if (code.includes('import React') || code.includes('export default')) return 'App.jsx';
  if (code.includes('import {') && code.includes('from')) return 'App.jsx';
  if (code.includes('function') && code.includes('(')) return 'script.js';
  return null;
}

// ─── DEFAULT TEMPLATE GENERATOR ────────────────────────────────────

function generateDefaultTemplate(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  switch (ext) {
    case 'html':
      return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>My Page</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <header>
    <h1>Welcome to My Site</h1>
  </header>
  <main>
    <p>This is a default HTML template.</p>
    <button id="clickMe">Click Me</button>
  </main>
  <footer>
    <p>&copy; 2025</p>
  </footer>
  <script src="script.js"></script>
</body>
</html>`;
    case 'css':
      return `/* Default CSS */
body {
  font-family: system-ui, -apple-system, sans-serif;
  max-width: 800px;
  margin: 2rem auto;
  padding: 0 1rem;
  line-height: 1.6;
  color: #1a1a1a;
  background: #fafafa;
}
h1 { color: #2c3e50; }
button {
  background: #3498db;
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  cursor: pointer;
}
button:hover { background: #2980b9; }`;
    case 'js':
      return `// Default JavaScript
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('clickMe');
  if (btn) {
    btn.addEventListener('click', () => {
      alert('Hello from JavaScript!');
    });
  }
  console.log('Page ready.');
});`;
    default:
      return `// Default content for ${filename}`;
  }
}

// ─── HANDLE CHAT ────────────────────────────────────────────────────

export async function handleChat({
  message,
  projectFiles = {},
  chatHistory = [],
  provider = 'openrouter',
  preferredModel = null,
  activeFile = null,
  recentFiles = [],
  consoleErrors = [],
  buildErrors = [],
  selectedCode = null,
  cursorPosition = null,
}) {
  console.log(`[AI Controller] handleChat | message="${message?.substring(0, 60)}..." | files=${Object.keys(projectFiles).length} | provider=${provider}`);

  // ─── GREETING SHORT-CIRCUIT ──────────────────────────────────────
  const trimmed = message?.trim().toLowerCase() || '';
  const isGreeting = /^(hello|hi|hey|howdy|good morning|good afternoon|good evening|what's up|sup|yo|greetings)[!?.]*$/i.test(trimmed);
  if (isGreeting) {
    console.log('[AI Controller] 🟢 Greeting detected – returning friendly response.');
    const greetingText = "Hello! 👋 I'm your AI coding assistant. I can help you write code, fix bugs, and explain concepts. Tell me what you need!";
    const result = {
      content: greetingText,
      message: greetingText,
      response: greetingText,
      provider: 'system',
      model: 'greeting',
      mode: 'general',
      edits: { applied: [], failed: [] },
      timestamp: new Date().toISOString(),
    };
    console.log('[AI Controller] ✅ Returning greeting response:', JSON.stringify(result, null, 2));
    return result;
  }

  // ─── Build prompt and detect mode ─────────────────────────────────
  const { messages, mode } = buildPrompt(projectFiles, message, {
    activeFile,
    recentFiles,
    consoleErrors,
    buildErrors,
    cursorPosition,
    selectedCode,
    chatHistory,
  });

  // Only add context enhancement for non‑general modes
  if (mode !== 'general') {
    const fileContext = buildFileContext(projectFiles, activeFile, recentFiles);
    const contextEnhancement = buildContextEnhancement(fileContext, projectFiles);
    if (contextEnhancement && messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg.role === 'user') {
        lastMsg.content = contextEnhancement + '\n\n' + lastMsg.content;
      }
    }
  }

  // ─── Call AI ──────────────────────────────────────────────────────
  let response;
  try {
    response = await callWithFallback(messages, provider, preferredModel, projectFiles);
  } catch (error) {
    console.error('[AI Controller] AI call failed:', error.message);
    console.error(error.stack);
    throw new Error(`AI service error: ${error.message}. Check API keys or enable MOCK_AI.`);
  }

  // ─── Handle empty AI response ────────────────────────────────────
  if (!response || !response.content) {
    console.warn('[AI Controller] AI returned empty response – using fallback.');
    const fallbackText = "I couldn't generate a proper response. Please try again or rephrase your request.";
    const result = {
      content: fallbackText,
      message: fallbackText,
      response: fallbackText,
      provider: 'system',
      model: 'fallback',
      mode: 'error',
      edits: { applied: [], failed: [] },
      timestamp: new Date().toISOString(),
    };
    console.log('[AI Controller] ✅ Returning fallback response:', JSON.stringify(result, null, 2));
    return result;
  }

  // ─── If general mode, return AI response as‑is ────────────────────
  if (mode === 'general') {
    console.log('[AI Controller] General mode – returning response as‑is');
    const result = {
      content: response.content,
      message: response.content,
      response: response.content,
      provider: response.provider,
      model: response.model,
      mode: 'general',
      edits: { applied: [], failed: [] },
      fileContext: undefined,
      timestamp: new Date().toISOString(),
    };
    console.log('[AI Controller] ✅ Returning general response:', JSON.stringify(result, null, 2));
    return result;
  }

  // ─── For code modes, parse and apply edits ──────────────────────
  const parsed = parseAiResponse(response.content);

  let updatedFiles = {};
  let appliedEdits = [];
  let failedEdits = [];

  // 1. Try applying edits/patches
  if ((parsed.edits && parsed.edits.length > 0) || (parsed.patches && parsed.patches.length > 0)) {
    const result = applyEdits(projectFiles, parsed.edits || [], parsed.patches || [], { activeFile });
    updatedFiles = result.updatedFiles;
    appliedEdits = result.applied;
    failedEdits = result.failed;
  }

  // 2. If no edits, try to extract any fenced code block
  if (Object.keys(updatedFiles).length === 0) {
    console.log('[AI Controller] No edit blocks found, attempting fallback extraction...');
    const fallbackEdits = extractCodeFromMessage(response.content);
    if (fallbackEdits.length > 0) {
      console.log(`[AI Controller] Fallback extracted ${fallbackEdits.length} code blocks`);
      const result = applyEdits(projectFiles, fallbackEdits, [], { activeFile });
      updatedFiles = result.updatedFiles;
      appliedEdits = result.applied;
      failedEdits = result.failed;
      // Update parsed.message to remove the raw code so it's not duplicated
      parsed.message = response.content.replace(/```[\s\S]*?```/g, '').trim() || parsed.message;
    }
  }

  // 3. Final fallback: generate default template (only if user asked for code)
  if (Object.keys(updatedFiles).length === 0) {
    console.log('[AI Controller] No code blocks found, generating default template...');
    let filename = 'index.html';
    const filenameMatch = response.content.match(/(?:created|updated|modified|changed)\s+([^\s]+\.(html|css|js|ts|tsx|jsx|json))/i);
    if (filenameMatch) {
      filename = filenameMatch[1];
    } else if (message.toLowerCase().includes('html')) {
      filename = 'index.html';
    } else if (message.toLowerCase().includes('css')) {
      filename = 'style.css';
    } else if (message.toLowerCase().includes('javascript') || message.toLowerCase().includes('js')) {
      filename = 'script.js';
    }
    const defaultCode = generateDefaultTemplate(filename);
    const edit = { filename, code: defaultCode };
    const result = applyEdits(projectFiles, [edit], [], { activeFile });
    updatedFiles = result.updatedFiles;
    appliedEdits = result.applied;
    failedEdits = result.failed;
    parsed.message = `✅ I've created a default \`${filename}\` template because your request didn't include the code. Here it is:

\`\`\`edit:${filename}
${defaultCode}
\`\`\`

You can click **Apply** to add it to your project.`;
  }

  const finalResponse = parsed.message || response.content || "I couldn't generate a proper response. Please try again.";
  const result = {
    content: finalResponse,
    message: finalResponse,
    response: finalResponse,
    provider: response.provider,
    model: response.model,
    mode: parsed.mode || mode,
    edits: {
      applied: appliedEdits,
      failed: failedEdits,
    },
    updatedFiles: Object.keys(updatedFiles).length > 0 ? updatedFiles : undefined,
    wireframes: parsed.wireframes?.length > 0 ? parsed.wireframes : undefined,
    fileContext: {
      analyzed: true,
      fileCount: Object.keys(projectFiles).length,
      htmlAnalyzed: !!projectFiles['index.html'],
    },
    timestamp: new Date().toISOString(),
  };

  console.log(`[AI Controller] ✅ Final response | mode=${result.mode} | edits=${appliedEdits.length} | patches=${parsed.patches?.length || 0} | wireframes=${parsed.wireframes?.length || 0}`);
  console.log('[AI Controller] Response object:', JSON.stringify(result, null, 2));

  return result;
}

// ─── HANDLE STREAM ──────────────────────────────────────────────────

export async function handleStream({
  message,
  projectFiles = {},
  chatHistory = [],
  provider = 'openrouter',
  preferredModel = null,
  activeFile = null,
  recentFiles = [],
  consoleErrors = [],
  buildErrors = [],
  selectedCode = null,
  cursorPosition = null,
  onChunk,
  onComplete,
}) {
  console.log(`[AI Controller] handleStream | message="${message?.substring(0, 60)}..." | files=${Object.keys(projectFiles).length}`);

  // Same greeting safety net
  const trimmed = message?.trim().toLowerCase() || '';
  const isGreeting = /^(hello|hi|hey|howdy|good morning|good afternoon|good evening|what's up|sup|yo|greetings)[!?.]*$/i.test(trimmed);
  if (isGreeting) {
    console.log('[AI Controller] 🟢 Stream greeting detected – returning friendly response.');
    const greetingText = "Hello! 👋 I'm your AI coding assistant. I can help you write code, fix bugs, and explain concepts. Tell me what you need!";
    const finalResult = {
      content: greetingText,
      message: greetingText,
      response: greetingText,
      provider: 'system',
      model: 'greeting',
      mode: 'general',
      edits: { applied: [], failed: [] },
    };
    const words = greetingText.split(' ');
    for (const word of words) {
      onChunk(word + ' ');
      await new Promise(r => setTimeout(r, 20));
    }
    if (onComplete) onComplete(finalResult);
    return finalResult;
  }

  const { messages, mode } = buildPrompt(projectFiles, message, {
    activeFile,
    recentFiles,
    consoleErrors,
    buildErrors,
    cursorPosition,
    selectedCode,
    chatHistory,
  });

  if (mode !== 'general') {
    const fileContext = buildFileContext(projectFiles, activeFile, recentFiles);
    const contextEnhancement = buildContextEnhancement(fileContext, projectFiles);
    if (contextEnhancement && messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg.role === 'user') {
        lastMsg.content = contextEnhancement + '\n\n' + lastMsg.content;
      }
    }
  }

  let fullResponse = '';
  let streamResult = null;

  try {
    streamResult = await streamWithFallback(
      messages,
      (chunk) => {
        fullResponse += chunk;
        if (onChunk) onChunk(chunk);
      },
      provider,
      preferredModel,
      projectFiles
    );
    fullResponse = streamResult.content;
  } catch (error) {
    console.error('[AI Controller] Stream AI call failed:', error.message);
    console.error(error.stack);
    throw new Error(`AI stream error: ${error.message}. Check API keys or enable MOCK_AI.`);
  }

  if (!fullResponse) {
    const fallbackText = "I couldn't generate a proper response. Please try again.";
    const finalResult = {
      content: fallbackText,
      message: fallbackText,
      response: fallbackText,
      provider: 'system',
      model: 'fallback',
      mode: 'error',
      edits: { applied: [], failed: [] },
    };
    if (onComplete) onComplete(finalResult);
    return finalResult;
  }

  if (mode === 'general') {
    const finalResult = {
      content: fullResponse,
      message: fullResponse,
      response: fullResponse,
      provider: streamResult.provider,
      model: streamResult.model,
      mode: 'general',
      edits: { applied: [], failed: [] },
    };
    if (onComplete) onComplete(finalResult);
    return finalResult;
  }

  const parsed = parseAiResponse(fullResponse);

  let updatedFiles = {};
  let appliedEdits = [];
  let failedEdits = [];

  if ((parsed.edits && parsed.edits.length > 0) || (parsed.patches && parsed.patches.length > 0)) {
    const result = applyEdits(projectFiles, parsed.edits || [], parsed.patches || [], { activeFile });
    updatedFiles = result.updatedFiles;
    appliedEdits = result.applied;
    failedEdits = result.failed;
  }

  if (Object.keys(updatedFiles).length === 0) {
    const fallbackEdits = extractCodeFromMessage(fullResponse);
    if (fallbackEdits.length > 0) {
      const result = applyEdits(projectFiles, fallbackEdits, [], { activeFile });
      updatedFiles = result.updatedFiles;
      appliedEdits = result.applied;
      failedEdits = result.failed;
      parsed.message = fullResponse.replace(/```[\s\S]*?```/g, '').trim() || parsed.message;
    }
  }

  if (Object.keys(updatedFiles).length === 0) {
    let filename = 'index.html';
    const filenameMatch = fullResponse.match(/(?:created|updated|modified|changed)\s+([^\s]+\.(html|css|js|ts|tsx|jsx|json))/i);
    if (filenameMatch) {
      filename = filenameMatch[1];
    } else if (message.toLowerCase().includes('html')) {
      filename = 'index.html';
    } else if (message.toLowerCase().includes('css')) {
      filename = 'style.css';
    } else if (message.toLowerCase().includes('javascript') || message.toLowerCase().includes('js')) {
      filename = 'script.js';
    }
    const defaultCode = generateDefaultTemplate(filename);
    const edit = { filename, code: defaultCode };
    const result = applyEdits(projectFiles, [edit], [], { activeFile });
    updatedFiles = result.updatedFiles;
    appliedEdits = result.applied;
    failedEdits = result.failed;
    parsed.message = `✅ I've created a default \`${filename}\` template. Here it is:

\`\`\`edit:${filename}
${defaultCode}
\`\`\`

You can click **Apply** to add it to your project.`;
  }

  const finalResponse = parsed.message || fullResponse || "I couldn't generate a proper response. Please try again.";
  const finalResult = {
    content: finalResponse,
    message: finalResponse,
    response: finalResponse,
    provider: streamResult.provider,
    model: streamResult.model,
    mode: parsed.mode || mode,
    edits: {
      applied: appliedEdits,
      failed: failedEdits,
    },
    updatedFiles: Object.keys(updatedFiles).length > 0 ? updatedFiles : undefined,
    wireframes: parsed.wireframes?.length > 0 ? parsed.wireframes : undefined,
    fileContext: {
      analyzed: true,
      fileCount: Object.keys(projectFiles).length,
      htmlAnalyzed: !!projectFiles['index.html'],
    },
  };

  if (onComplete) onComplete(finalResult);

  console.log(`[AI Controller] Stream complete | mode=${finalResult.mode} | edits=${appliedEdits.length} | patches=${parsed.patches?.length || 0}`);
  console.log('[AI Controller] Stream final result:', JSON.stringify(finalResult, null, 2));

  return finalResult;
}

// ─── HANDLE ANALYZE ─────────────────────────────────────────────────

export async function handleAnalyze({
  projectFiles = {},
  provider = 'openrouter',
  preferredModel = null,
  activeFile = null,
}) {
  const message = 'Please analyze this entire project. Review all files for: bugs, security issues, performance problems, maintainability issues, and TypeScript type safety. Provide a comprehensive code review with fixes for each issue found.';

  return handleChat({
    message,
    projectFiles,
    provider,
    preferredModel,
    activeFile,
    chatHistory: [],
  });
}

// ─── HANDLE EXPLAIN ─────────────────────────────────────────────────

export async function handleExplain({
  projectFiles = {},
  filename,
  provider = 'openrouter',
  preferredModel = null,
  activeFile = null,
}) {
  const fileContent = projectFiles[filename] || '';
  const message = `Please explain the code in ${filename}. Break down:
1. What this file does overall
2. Key functions/components and their purposes
3. The data flow and logic
4. Any important patterns or techniques used
5. How it relates to other files in the project

Here is the file content:
\`\`\`
${fileContent}
\`\`\``;

  return handleChat({
    message,
    projectFiles,
    provider,
    preferredModel,
    activeFile: filename,
    chatHistory: [],
  });
}
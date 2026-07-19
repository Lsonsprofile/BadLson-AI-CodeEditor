// backend/controllers/aiController.mjs
import {
  buildPrompt,
  callWithFallback,
  streamWithFallback,
  parseAiResponse,
  applyEdits,
} from '../services/aiService.mjs';

// ─── CONTEXT BUILDER ────────────────────────────────────────────────
/**
 * Builds rich context about the project structure for the AI.
 * Analyzes HTML structure, imports, and file relationships.
 */
function buildFileContext(projectFiles, activeFile, recentFiles = []) {
  const context = {
    fileCount: Object.keys(projectFiles).length,
    activeFile,
    recentFiles,
    htmlStructure: null,
    importGraph: {},
    fileTypes: {},
  };

  // Analyze file types
  for (const filename of Object.keys(projectFiles)) {
    const ext = filename.split('.').pop();
    context.fileTypes[ext] = (context.fileTypes[ext] || 0) + 1;
  }

  // Analyze HTML structure if index.html exists
  if (projectFiles['index.html']) {
    context.htmlStructure = analyzeHtmlStructure(projectFiles['index.html']);
  }

  // Build import graph
  context.importGraph = buildImportGraph(projectFiles);

  return context;
}

/**
 * Analyzes HTML structure: tags, hierarchy, IDs, classes
 */
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

  // Extract title
  const titleMatch = htmlContent.match(/<title[^>]*>([^<]*)<\/title>/i);
  if (titleMatch) structure.title = titleMatch[1];

  // Extract meta tags
  const metaMatches = htmlContent.matchAll(/<meta[^>]*>/gi);
  for (const match of metaMatches) {
    const nameMatch = match[0].match(/name=["']([^"']+)["']/i);
    const contentMatch = match[0].match(/content=["']([^"']+)["']/i);
    if (nameMatch && contentMatch) {
      structure.metaTags.push({ name: nameMatch[1], content: contentMatch[1] });
    }
  }

  // Extract scripts
  const scriptMatches = htmlContent.matchAll(/<script[^>]*src=["']([^"']+)["'][^>]*>/gi);
  for (const match of scriptMatches) {
    structure.scripts.push(match[1]);
  }

  // Extract stylesheets
  const linkMatches = htmlContent.matchAll(/<link[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/gi);
  for (const match of linkMatches) {
    structure.stylesheets.push(match[1]);
  }

  // Extract body classes
  const bodyMatch = htmlContent.match(/<body[^>]*class=["']([^"']+)["'][^>]*>/i);
  if (bodyMatch) {
    structure.bodyClasses = bodyMatch[1].split(/\s+/);
  }

  // Count main structural elements
  const mainTags = ['header', 'nav', 'main', 'section', 'article', 'aside', 'footer', 'div'];
  for (const tag of mainTags) {
    const count = (htmlContent.match(new RegExp(`<${tag}[\\s>]`, 'gi')) || []).length;
    if (count > 0) {
      structure.mainSections.push({ tag, count });
    }
  }

  // Calculate approximate DOM depth
  let maxDepth = 0;
  let currentDepth = 0;
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

/**
 * Builds import dependency graph
 */
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

  // Build reverse mapping
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
  console.log(`[AI Controller] handleChat | message="${message.substring(0, 60)}..." | files=${Object.keys(projectFiles).length} | provider=${provider}`);

  // Build rich file context
  const fileContext = buildFileContext(projectFiles, activeFile, recentFiles);

  // Enhance prompt with file context analysis
  const contextEnhancement = buildContextEnhancement(fileContext, projectFiles);

  // Build the prompt with file context
  const { messages, mode } = buildPrompt(projectFiles, message, {
    activeFile,
    recentFiles,
    consoleErrors,
    buildErrors,
    cursorPosition,
    selectedCode,
    chatHistory,
  });

  // Prepend context enhancement to the last user message
  if (contextEnhancement && messages.length > 0) {
    const lastMsg = messages[messages.length - 1];
    if (lastMsg.role === 'user') {
      lastMsg.content = contextEnhancement + '\n\n' + lastMsg.content;
    }
  }

  // Get response from AI
  const response = await callWithFallback(messages, provider, preferredModel, projectFiles);

  // Parse the response for edit blocks, patches, and wireframes
  const parsed = parseAiResponse(response.content);

  // Apply edits to files if any
  let updatedFiles = {};
  let appliedEdits = [];
  let failedEdits = [];

  if ((parsed.edits && parsed.edits.length > 0) || (parsed.patches && parsed.patches.length > 0)) {
    const result = applyEdits(projectFiles, parsed.edits || [], parsed.patches || [], { activeFile });
    updatedFiles = result.updatedFiles;
    appliedEdits = result.applied;
    failedEdits = result.failed;
  }

  // Build the response
  const result = {
    content: parsed.message || response.content,
    provider: response.provider,
    model: response.model,
    mode: parsed.mode || mode,
    edits: {
      applied: appliedEdits,
      failed: failedEdits,
    },
    updatedFiles: Object.keys(updatedFiles).length > 0 ? updatedFiles : undefined,
    wireframes: parsed.wireframes.length > 0 ? parsed.wireframes : undefined,
    fileContext: {
      analyzed: true,
      fileCount: fileContext.fileCount,
      htmlAnalyzed: !!fileContext.htmlStructure,
    },
    timestamp: new Date().toISOString(),
  };

  console.log(`[AI Controller] Response | mode=${result.mode} | edits=${appliedEdits.length} | patches=${parsed.patches?.length || 0} | wireframes=${parsed.wireframes?.length || 0}`);

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
  console.log(`[AI Controller] handleStream | message="${message.substring(0, 60)}..." | files=${Object.keys(projectFiles).length}`);

  // Build rich file context
  const fileContext = buildFileContext(projectFiles, activeFile, recentFiles);
  const contextEnhancement = buildContextEnhancement(fileContext, projectFiles);

  // Build the prompt
  const { messages, mode } = buildPrompt(projectFiles, message, {
    activeFile,
    recentFiles,
    consoleErrors,
    buildErrors,
    cursorPosition,
    selectedCode,
    chatHistory,
  });

  // Prepend context enhancement
  if (contextEnhancement && messages.length > 0) {
    const lastMsg = messages[messages.length - 1];
    if (lastMsg.role === 'user') {
      lastMsg.content = contextEnhancement + '\n\n' + lastMsg.content;
    }
  }

  let fullResponse = '';
  let streamResult = null;

  // Stream the response
  const result = await streamWithFallback(
    messages,
    (chunk) => {
      fullResponse += chunk;
      if (onChunk) onChunk(chunk);
    },
    provider,
    preferredModel,
    projectFiles
  );

  streamResult = result;
  fullResponse = result.content;

  // Parse the complete response
  const parsed = parseAiResponse(fullResponse);

  // Apply edits
  let updatedFiles = {};
  let appliedEdits = [];
  let failedEdits = [];

  if ((parsed.edits && parsed.edits.length > 0) || (parsed.patches && parsed.patches.length > 0)) {
    const result = applyEdits(projectFiles, parsed.edits || [], parsed.patches || [], { activeFile });
    updatedFiles = result.updatedFiles;
    appliedEdits = result.applied;
    failedEdits = result.failed;
  }

  const finalResult = {
    content: parsed.message || fullResponse,
    provider: streamResult.provider,
    model: streamResult.model,
    mode: parsed.mode || mode,
    edits: {
      applied: appliedEdits,
      failed: failedEdits,
    },
    updatedFiles: Object.keys(updatedFiles).length > 0 ? updatedFiles : undefined,
    wireframes: parsed.wireframes.length > 0 ? parsed.wireframes : undefined,
    fileContext: {
      analyzed: true,
      fileCount: fileContext.fileCount,
      htmlAnalyzed: !!fileContext.htmlStructure,
    },
  };

  if (onComplete) onComplete(finalResult);

  console.log(`[AI Controller] Stream complete | mode=${finalResult.mode} | edits=${appliedEdits.length} | patches=${parsed.patches?.length || 0}`);

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

// ─── CONTEXT ENHANCEMENT BUILDER ────────────────────────────────────
function buildContextEnhancement(fileContext, projectFiles) {
  const parts = [];

  parts.push('=== PROJECT ANALYSIS ===');

  // File type summary
  const typeSummary = Object.entries(fileContext.fileTypes)
    .map(([ext, count]) => `${ext}: ${count}`)
    .join(', ');
  parts.push(`File types: ${typeSummary} (total: ${fileContext.fileCount})`);

  // HTML structure analysis
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

  // Import graph insights
  const heavilyImported = Object.entries(fileContext.importGraph)
    .filter(([_, data]) => data.importedBy.length > 2)
    .map(([file, data]) => `${file} (imported by ${data.importedBy.length} files)`);

  if (heavilyImported.length > 0) {
    parts.push(`\nKey shared modules: ${heavilyImported.join(', ')}`);
  }

  // Active file context
  if (fileContext.activeFile && projectFiles[fileContext.activeFile]) {
    const content = projectFiles[fileContext.activeFile];
    const lines = content.split('\n').length;
    parts.push(`\nCurrently editing: ${fileContext.activeFile} (${lines} lines)`);

    // Detect component type
    if (content.includes('import React')) {
      parts.push('  Type: React component');
    } else if (content.includes('export default function') || content.includes('export function')) {
      parts.push('  Type: Function module');
    } else if (content.includes('interface ') || content.includes('type ')) {
      parts.push('  Type: Type definitions');
    }

    // Detect hooks used
    const hooks = ['useState', 'useEffect', 'useContext', 'useReducer', 'useMemo', 'useCallback', 'useRef'];
    const usedHooks = hooks.filter(h => content.includes(h));
    if (usedHooks.length > 0) {
      parts.push(`  React hooks: ${usedHooks.join(', ')}`);
    }
  }

  parts.push('=== END PROJECT ANALYSIS ===');

  return parts.join('\n');
}
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const target = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'services', 'aiService.mjs');
if (!fs.existsSync(target)) process.exit(0);
let s = fs.readFileSync(target, 'utf8');
let n = 0;

if (!s.includes('FORCE CODE CONTEXT')) {
  if (s.includes('function detectMode(userMessage, context = {}) {')) {
    s = s.replace(
      'function detectMode(userMessage, context = {}) {',
      `function detectMode(userMessage, context = {}) {
  // FORCE CODE CONTEXT: any mention of files/folders/project must include context
  const forceCode =
    /\\b(file|files|folder|folders|project|code|html|css|js|tsx?|component|bug|error|fix|create|edit|refactor)\\b/i.test(
      userMessage || ''
    );`
    );
    s = s.replace(
      "    console.log(`[detectMode] → general (matched pattern)`);\n    return 'general';",
      `    if (!forceCode) {
      console.log(\`[detectMode] → general (matched pattern)\`);
      return 'general';
    }
    console.log(\`[detectMode] general pattern matched but forceCode → continue\`);`
    );
    n++;
  }
}

if (!s.includes('FOLDERS:') && s.includes('PROJECT STRUCTURE:')) {
  s = s.replace(
    `export function buildPrompt(projectFiles, userMessage, options = {}) {
  const {
    activeFile = null, recentFiles = [], consoleErrors = [], buildErrors = [],
    cursorPosition = null, selectedCode = null, chatHistory = [],
  } = options;`,
    `export function buildPrompt(projectFiles, userMessage, options = {}) {
  const {
    activeFile = null, recentFiles = [], consoleErrors = [], buildErrors = [],
    cursorPosition = null, selectedCode = null, chatHistory = [],
    folders = [],
  } = options;`
  );
  s = s.replace(
    `  let contextParts = [];
  contextParts.push(\`PROJECT STRUCTURE:\\n\${tree}\`);`,
    `  let contextParts = [];
  contextParts.push(\`PROJECT STRUCTURE:\\n\${tree}\`);
  if (Array.isArray(folders) && folders.length > 0) {
    contextParts.push(\`FOLDERS:\\n\${folders.map((f) => \\\- \${f}/\\`).join('\\n')}\`);
  }`
  );
  n++;
}

if (n > 0) {
  fs.writeFileSync(target, s);
  console.log('patch-ai-context: applied', n);
} else {
  console.log('patch-ai-context: already applied or skipped');
}

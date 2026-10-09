// Improve AI project awareness: folders + HTML↔CSS/JS relationships
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const target = path.join(__dirname, '..', 'backend', 'services', 'aiService.mjs');
let s = fs.readFileSync(target, 'utf8');
let n = 0;

if (!s.includes('function buildAssetRelationships')) {
  const marker = 'export function selectRelevantFiles(projectFiles, userMessage, activeFile = null, recentFiles = []) {';
  const helper = `
/** Resolve relative href/src against an HTML file path */
function resolveRelativePath(fromFile, relative) {
  if (!relative || /^(https?:|data:|blob:|\\/\\/)/i.test(relative)) return null;
  const clean = relative.split('?')[0].split('#')[0].trim();
  if (!clean) return null;
  const baseDir = fromFile.includes('/') ? fromFile.slice(0, fromFile.lastIndexOf('/') + 1) : '';
  const parts = (baseDir + clean).split('/');
  const stack = [];
  for (const p of parts) {
    if (p === '' || p === '.') continue;
    if (p === '..') stack.pop();
    else stack.push(p);
  }
  return stack.join('/');
}

function buildAssetRelationships(projectFiles) {
  const fileSet = new Set(Object.keys(projectFiles));
  const htmlToAssets = {};
  const assetToHtml = {};
  for (const [pathName, content] of Object.entries(projectFiles)) {
    if (!/\.html?$/i.test(pathName) || typeof content !== 'string') continue;
    const css = [];
    const js = [];
    const linkRe = /<link[^>]+href=["']([^"']+)["'][^>]*>/gi;
    let m;
    while ((m = linkRe.exec(content)) !== null) {
      if (!/rel=["']?stylesheet/i.test(m[0]) && !/\.css/i.test(m[1])) continue;
      const resolved = resolveRelativePath(pathName, m[1]);
      if (resolved) css.push(fileSet.has(resolved) ? resolved : resolved + ' (missing)');
    }
    const scriptRe = /<script[^>]+src=["']([^"']+)["'][^>]*>/gi;
    while ((m = scriptRe.exec(content)) !== null) {
      const resolved = resolveRelativePath(pathName, m[1]);
      if (resolved) js.push(fileSet.has(resolved) ? resolved : resolved + ' (missing)');
    }
    htmlToAssets[pathName] = { css: [...new Set(css)], js: [...new Set(js)] };
    for (const c of htmlToAssets[pathName].css) {
      if (c.includes('(missing)')) continue;
      if (!assetToHtml[c]) assetToHtml[c] = [];
      assetToHtml[c].push(pathName);
    }
    for (const j of htmlToAssets[pathName].js) {
      if (j.includes('(missing)')) continue;
      if (!assetToHtml[j]) assetToHtml[j] = [];
      assetToHtml[j].push(pathName);
    }
  }
  return { htmlToAssets, assetToHtml };
}

function formatAssetRelationships(rels) {
  const lines = [];
  const htmls = Object.keys(rels.htmlToAssets).sort();
  if (htmls.length === 0) return '(no HTML↔CSS links detected)';
  for (const html of htmls) {
    const { css, js } = rels.htmlToAssets[html];
    lines.push('• ' + html);
    lines.push('    styles: ' + (css.length ? css.join(', ') : '(none linked)'));
    if (js.length) lines.push('    scripts: ' + js.join(', '));
  }
  return lines.join('\n');
}

`;
  if (s.includes(marker)) {
    s = s.replace(marker, helper + marker);
    n++;
    console.log('✓ asset relationship helpers');
  } else console.warn('selectRelevantFiles marker missing');
} else console.log('· helpers already present');

// Inject assetRels at start of selectRelevantFiles
if (!s.includes('const assetRels = buildAssetRelationships(projectFiles)')) {
  const needle = `  const entries = Object.entries(projectFiles);
  const totalFiles = entries.length;
  if (totalFiles === 0) return {};
  if (totalFiles <= TOKEN_BUDGET.MAX_FILES) {`;
  const repl = `  const entries = Object.entries(projectFiles);
  const totalFiles = entries.length;
  if (totalFiles === 0) return {};
  const assetRels = buildAssetRelationships(projectFiles);
  if (totalFiles <= TOKEN_BUDGET.MAX_FILES) {`;
  if (s.includes(needle)) {
    s = s.replace(needle, repl);
    n++;
    console.log('✓ assetRels in selectRelevantFiles');
  }
}

// Score boost for linked CSS/JS
if (!s.includes('Prefer CSS/JS linked from the active HTML')) {
  const needle = `    if (activeFile && importMap[activeFile]?.includes(filename)) score += 400;
    if (activeFile && importMap[filename]?.includes(activeFile)) score += 300;`;
  const repl = `    if (activeFile && importMap[activeFile]?.includes(filename)) score += 400;
    if (activeFile && importMap[filename]?.includes(activeFile)) score += 300;

    // Prefer CSS/JS linked from the active HTML
    if (activeFile && typeof assetRels !== 'undefined' && assetRels) {
      const a = assetRels.htmlToAssets[activeFile];
      if (a && (a.css.includes(filename) || a.js.includes(filename))) score += 1500;
      const parents = assetRels.assetToHtml[activeFile];
      if (parents && parents.includes(filename)) score += 1200;
    }
    if (activeFile && activeFile.includes('/')) {
      const dir = activeFile.slice(0, activeFile.lastIndexOf('/') + 1);
      if (filename.startsWith(dir)) score += 200;
    }`;
  if (s.includes(needle)) {
    s = s.replace(needle, repl);
    n++;
    console.log('✓ linked-asset score boost');
  }
}

// Prompt context: relationships section
if (!s.includes('HTML ↔ CSS / JS LINKS')) {
  const needle = `  const selectedFiles = selectRelevantFiles(projectFiles, userMessage, activeFile, recentFiles);
  const allFilenames = Object.keys(projectFiles);
  const tree = buildCompactTree(allFilenames, selectedFiles);

  let contextParts = [];
  contextParts.push(\`PROJECT STRUCTURE:\\n\${tree}\`);`;
  const repl = `  const selectedFiles = selectRelevantFiles(projectFiles, userMessage, activeFile, recentFiles);
  const allFilenames = Object.keys(projectFiles);
  const tree = buildCompactTree(allFilenames, selectedFiles);
  const rels = typeof buildAssetRelationships === 'function' ? buildAssetRelationships(projectFiles) : { htmlToAssets: {}, assetToHtml: {} };
  const relText = typeof formatAssetRelationships === 'function' ? formatAssetRelationships(rels) : '(n/a)';
  const folderSet = new Set();
  for (const f of allFilenames) {
    const parts = f.split('/');
    let acc = '';
    for (let i = 0; i < parts.length - 1; i++) {
      acc = acc ? acc + '/' + parts[i] : parts[i];
      folderSet.add(acc);
    }
  }
  for (const f of (options.folders || [])) if (f) folderSet.add(f);
  const folderList = [...folderSet].sort().slice(0, 80).join(', ') || '(none)';

  let contextParts = [];
  contextParts.push(\`PROJECT STRUCTURE (★ = full content below):\\n\${tree}\`);
  contextParts.push(\`FOLDERS: \${folderList}\`);
  contextParts.push(\`HTML ↔ CSS / JS LINKS:\\n\${relText}\`);
  contextParts.push('RULES: Only edit CSS linked from the HTML page in use. Prefer matching names (about.html → about.css). Use full paths in edit: blocks.');`;
  if (s.includes('PROJECT STRUCTURE:')) {
    // softer replace of first project structure push only
    s = s.replace(
      'contextParts.push(`PROJECT STRUCTURE:\n${tree}`);',
      `contextParts.push(\`PROJECT STRUCTURE (★ = full content below):\\n\${tree}\`);
  const rels2 = typeof buildAssetRelationships === 'function' ? buildAssetRelationships(projectFiles) : { htmlToAssets: {}, assetToHtml: {} };
  const relText2 = typeof formatAssetRelationships === 'function' ? formatAssetRelationships(rels2) : '';
  contextParts.push(\`HTML ↔ CSS / JS LINKS:\\n\${relText2}\`);
  contextParts.push('RULES: Only edit the CSS linked from the active HTML page. Do not mix styles across pages. Use full file paths in edit: blocks.');`
    );
    n++;
    console.log('✓ prompt relationship section');
  }
}

// folders option on buildPrompt
if (!s.includes('folders = []')) {
  s = s.replace(
    'cursorPosition = null, selectedCode = null, chatHistory = [],',
    'cursorPosition = null, selectedCode = null, chatHistory = [], folders = [],'
  );
  n++;
  console.log('✓ folders option');
}

fs.writeFileSync(target, s);
console.log(n ? `Done (${n} updates). Restart backend.` : 'Already wired or partial.');

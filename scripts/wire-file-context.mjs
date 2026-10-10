// Safe file-context wire — validates syntax after any change
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const target = path.join(__dirname, '..', 'backend', 'services', 'aiService.mjs');
const original = fs.readFileSync(target, 'utf8');

if (original.includes('function buildAssetRelationships')) {
  console.log('· file-context already present');
  process.exit(0);
}

const marker = 'export function selectRelevantFiles(projectFiles, userMessage, activeFile = null, recentFiles = []) {';
if (!original.includes(marker)) {
  console.warn('selectRelevantFiles not found — skip');
  process.exit(0);
}

const helper = `
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
    if (!/\\.html?$/i.test(pathName) || typeof content !== 'string') continue;
    const css = [];
    const js = [];
    let m;
    const linkRe = /<link[^>]+href=["']([^"']+)["'][^>]*>/gi;
    while ((m = linkRe.exec(content)) !== null) {
      if (!/rel=["']?stylesheet/i.test(m[0]) && !/\\.css/i.test(m[1])) continue;
      const resolved = resolveRelativePath(pathName, m[1]);
      if (resolved) css.push(resolved);
    }
    const scriptRe = /<script[^>]+src=["']([^"']+)["'][^>]*>/gi;
    while ((m = scriptRe.exec(content)) !== null) {
      const resolved = resolveRelativePath(pathName, m[1]);
      if (resolved) js.push(resolved);
    }
    htmlToAssets[pathName] = { css: [...new Set(css)], js: [...new Set(js)] };
    for (const c of htmlToAssets[pathName].css) {
      if (!assetToHtml[c]) assetToHtml[c] = [];
      assetToHtml[c].push(pathName);
    }
    for (const j of htmlToAssets[pathName].js) {
      if (!assetToHtml[j]) assetToHtml[j] = [];
      assetToHtml[j].push(pathName);
    }
  }
  return { htmlToAssets, assetToHtml };
}

function formatAssetRelationships(rels) {
  const lines = [];
  const htmls = Object.keys(rels.htmlToAssets).sort();
  if (htmls.length === 0) return '(no HTML-CSS links detected)';
  for (const html of htmls) {
    const { css, js } = rels.htmlToAssets[html];
    lines.push('* ' + html);
    lines.push('    styles: ' + (css.length ? css.join(', ') : '(none)'));
    if (js.length) lines.push('    scripts: ' + js.join(', '));
  }
  return lines.join('\\n');
}

`;

let next = original.replace(marker, helper + marker);

if (next.includes('contextParts.push(`PROJECT STRUCTURE:\\n${tree}`);') && !next.includes('HTML-CSS LINKS')) {
  next = next.replace(
    'contextParts.push(`PROJECT STRUCTURE:\\n${tree}`);',
    `const _rels = typeof buildAssetRelationships === 'function' ? buildAssetRelationships(projectFiles) : null;
  const _relText = _rels && typeof formatAssetRelationships === 'function' ? formatAssetRelationships(_rels) : '';
  contextParts.push(\\`PROJECT STRUCTURE:\\n\\${tree}\\`);
  if (_relText) contextParts.push(\\`HTML-CSS LINKS:\\n\\${_relText}\\`);`
  );
}

fs.writeFileSync(target, next);
const check = spawnSync(process.execPath, ['--check', target], { encoding: 'utf8' });
if (check.status !== 0) {
  console.error('Syntax error after wire — restoring original');
  console.error(check.stderr || check.stdout);
  fs.writeFileSync(target, original);
  process.exit(1);
}
console.log('✓ file-context wired (syntax OK)');

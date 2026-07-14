// backend/scripts/validate-project.mjs
// Run: node backend/scripts/validate-project.mjs

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.resolve(__dirname, '../..');
const SRC_DIR = path.join(ROOT, 'src');
const BACKEND_DIR = path.join(ROOT, 'backend');

const issues = [];
const warnings = [];
const stats = { filesChecked: 0, importsFound: 0, exportsFound: 0 };

function readFile(filePath) {
  try { return fs.readFileSync(filePath, 'utf-8'); } catch { return null; }
}

function getAllFiles(dir, extensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs']) {
  const files = [];
  if (!fs.existsSync(dir)) return files;
  
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules' && !entry.name.startsWith('.')) {
      files.push(...getAllFiles(fullPath, extensions));
    } else if (extensions.some(ext => entry.name.endsWith(ext))) {
      files.push(fullPath);
    }
  }
  return files;
}

function resolveImport(importPath, fromFile) {
  const fromDir = path.dirname(fromFile);
  
  if (importPath.startsWith('.')) {
    const resolved = path.resolve(fromDir, importPath);
    const extensions = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '/index.ts', '/index.tsx', '/index.js', '/index.mjs'];
    for (const ext of extensions) {
      if (fs.existsSync(resolved + ext)) return resolved + ext;
    }
    return null;
  }
  
  if (importPath.startsWith('@/') || importPath.startsWith('~/')) {
    const basePath = importPath.replace(/^[@~]\//, '');
    const possiblePaths = [
      path.join(SRC_DIR, basePath),
      path.join(SRC_DIR, basePath + '.ts'),
      path.join(SRC_DIR, basePath + '.tsx'),
      path.join(SRC_DIR, basePath, 'index.ts'),
      path.join(SRC_DIR, basePath, 'index.tsx'),
    ];
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) return p;
    }
    return null;
  }
  
  return 'node_module';
}

function extractImports(content) {
  const imports = [];
  const es6Regex = /import\s+(?:(?:\{[^}]*\}\s*from\s*)|(?:[^'"]*\s+from\s*))?['"]([^'"]+)['"];?/g;
  let match;
  while ((match = es6Regex.exec(content)) !== null) {
    imports.push({ path: match[1], raw: match[0] });
  }
  const dynamicRegex = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((match = dynamicRegex.exec(content)) !== null) {
    imports.push({ path: match[1], raw: match[0] });
  }
  const cjsRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((match = cjsRegex.exec(content)) !== null) {
    imports.push({ path: match[1], raw: match[0] });
  }
  return imports;
}

function extractExports(content) {
  const exports = [];
  const defaultRegex = /export\s+default\s+(?:class|function|const|let|var|\w+)?/g;
  let match;
  while ((match = defaultRegex.exec(content)) !== null) {
    exports.push({ type: 'default', raw: match[0] });
  }
  const namedRegex = /export\s+(?:\{[^}]*\}|(?:const|let|var|function|class|async\s+function)\s+\w+)/g;
  while ((match = namedRegex.exec(content)) !== null) {
    exports.push({ type: 'named', raw: match[0] });
  }
  return exports;
}

// ─── Scan Frontend ────────────────────────────────────────────────────
console.log('\n🔍 Scanning frontend (src/)...');
const srcFiles = getAllFiles(SRC_DIR);

for (const file of srcFiles) {
  stats.filesChecked++;
  const content = readFile(file);
  if (!content) continue;
  
  const imports = extractImports(content);
  const exports = extractExports(content);
  stats.importsFound += imports.length;
  stats.exportsFound += exports.length;
  
  const relativePath = path.relative(ROOT, file);
  
  for (const imp of imports) {
    if (imp.path.startsWith('.') || imp.path.startsWith('@/') || imp.path.startsWith('~/')) {
      const resolved = resolveImport(imp.path, file);
      if (!resolved) {
        issues.push({
          file: relativePath,
          severity: 'ERROR',
          type: 'Unresolved import',
          import: imp.path,
          message: `Cannot resolve \`${imp.path}\``,
        });
      }
    }
  }
}

// ─── Scan Backend ─────────────────────────────────────────────────────
console.log('🔍 Scanning backend...');
const backendFiles = getAllFiles(BACKEND_DIR, ['.mjs', '.js', '.ts']);

for (const file of backendFiles) {
  stats.filesChecked++;
  const content = readFile(file);
  if (!content) continue;
  
  const imports = extractImports(content);
  const exports = extractExports(content);
  stats.importsFound += imports.length;
  stats.exportsFound += exports.length;
  
  const relativePath = path.relative(ROOT, file);
  
  for (const imp of imports) {
    if (imp.path.startsWith('.')) {
      const resolved = resolveImport(imp.path, file);
      if (!resolved) {
        issues.push({
          file: relativePath,
          severity: 'ERROR',
          type: 'Unresolved import',
          import: imp.path,
          message: `Cannot resolve \`${imp.path}\``,
        });
      }
    }
  }
  
  // Check for duplicate imports
  const importPaths = imports.map(i => i.path);
  const seen = new Set();
  for (const p of importPaths) {
    if (seen.has(p)) {
      warnings.push({
        file: relativePath,
        severity: 'WARNING',
        type: 'Duplicate import',
        import: p,
        message: `Duplicate import of \`${p}\``,
      });
    }
    seen.add(p);
  }
}

// ─── Report ───────────────────────────────────────────────────────────
console.log('\n' + '='.repeat(70));
console.log('📊 VALIDATION REPORT');
console.log('='.repeat(70));

console.log(`\n📁 Files checked: ${stats.filesChecked}`);
console.log(`📥 Imports found: ${stats.importsFound}`);
console.log(`📤 Exports found: ${stats.exportsFound}`);

const errors = issues.filter(i => i.severity === 'ERROR');

if (errors.length === 0 && warnings.length === 0) {
  console.log('\n✅ All imports/exports look valid!');
} else {
  if (errors.length > 0) {
    console.log(`\n❌ ERRORS (${errors.length}):`);
    console.log('-'.repeat(70));
    for (const err of errors) {
      console.log(`\n  📄 ${err.file}`);
      console.log(`     Import: ${err.import}`);
      console.log(`     ${err.message}`);
    }
  }
  
  if (warnings.length > 0) {
    console.log(`\n⚠️  WARNINGS (${warnings.length}):`);
    console.log('-'.repeat(70));
    for (const w of warnings) {
      console.log(`\n  📄 ${w.file}`);
      console.log(`     ${w.message}`);
    }
  }
}

const reportPath = path.join(ROOT, 'validation-report.json');
fs.writeFileSync(reportPath, JSON.stringify({
  timestamp: new Date().toISOString(),
  stats,
  errors,
  warnings,
}, null, 2));

console.log(`\n📝 Full report saved to: validation-report.json`);
console.log('='.repeat(70));

process.exit(errors.length > 0 ? 1 : 0);
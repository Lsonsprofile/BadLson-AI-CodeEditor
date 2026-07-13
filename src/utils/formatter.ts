export function formatHTML(code: string): string {
  try {
    let formatted = '';
    let indent = 0;

    const lines = code.split('\n');

    for (let line of lines) {
      const trimmed = line.trim();

      if (!trimmed) {
        formatted += '\n';
        continue;
      }

      if (
        trimmed.startsWith('</') ||
        trimmed.startsWith('}') ||
        trimmed.startsWith(']')
      ) {
        indent = Math.max(0, indent - 1);
      }

      formatted += `${'  '.repeat(indent)}${trimmed}\n`;

      if (
        trimmed.startsWith('<') &&
        !trimmed.startsWith('</') &&
        !trimmed.endsWith('/>') &&
        !trimmed.includes('</') &&
        !trimmed.startsWith('<!')
      ) {
        indent++;
      }

      if (trimmed.endsWith('{') || trimmed.endsWith('[')) {
        indent++;
      }
    }

    return formatted.trimEnd();
  } catch {
    return code;
  }
}

export function formatCSS(code: string): string {
  try {
    let formatted = '';
    let indent = 0;

    const lines = code.split('\n');

    for (let line of lines) {
      const trimmed = line.trim();

      if (!trimmed) {
        formatted += '\n';
        continue;
      }

      if (trimmed.includes('}')) {
        indent = Math.max(0, indent - 1);
      }

      formatted += `${'  '.repeat(indent)}${trimmed}\n`;

      if (trimmed.includes('{')) {
        indent++;
      }
    }

    return formatted.trimEnd();
  } catch {
    return code;
  }
}

export function formatJS(code: string): string {
  try {
    let formatted = '';
    let indent = 0;

    const lines = code.split('\n');

    for (let line of lines) {
      const trimmed = line.trim();

      if (!trimmed) {
        formatted += '\n';
        continue;
      }

      if (
        trimmed.startsWith('}') ||
        trimmed.startsWith(']') ||
        trimmed.startsWith(')')
      ) {
        indent = Math.max(0, indent - 1);
      }

      if (
        trimmed.startsWith('else') ||
        trimmed.startsWith('catch') ||
        trimmed.startsWith('finally')
      ) {
        indent = Math.max(0, indent - 1);

        formatted += `${'  '.repeat(indent)}${trimmed}\n`;

        indent++;

        continue;
      }

      formatted += `${'  '.repeat(indent)}${trimmed}\n`;

      if (
        trimmed.endsWith('{') ||
        trimmed.endsWith('[') ||
        trimmed.endsWith('(')
      ) {
        indent++;
      }
    }

    return formatted.trimEnd();
  } catch {
    return code;
  }
}

export function getFileLanguage(filename: string): string {
  if (!filename) {
    return 'plaintext';
  }

  const extension = filename.split('.').pop()?.toLowerCase() ?? '';

  const languageMap: Record<string, string> = {
    html: 'html',
    htm: 'html',

    css: 'css',
    scss: 'scss',
    sass: 'sass',
    less: 'less',

    js: 'javascript',
    mjs: 'javascript',
    cjs: 'javascript',
    jsx: 'javascript',

    ts: 'typescript',
    mts: 'typescript',
    cts: 'typescript',
    tsx: 'typescript',

    json: 'json',
    jsonc: 'json',

    md: 'markdown',
    mdx: 'markdown',

    py: 'python',

    php: 'php',

    java: 'java',

    cs: 'csharp',

    cpp: 'cpp',
    cc: 'cpp',
    cxx: 'cpp',
    c: 'c',

    go: 'go',

    rs: 'rust',

    rb: 'ruby',

    swift: 'swift',

    kt: 'kotlin',

    sql: 'sql',

    xml: 'xml',

    svg: 'xml',

    yaml: 'yaml',
    yml: 'yaml',

    vue: 'vue',

    svelte: 'svelte',

    sh: 'shell',
    bash: 'shell',

    dockerfile: 'dockerfile',
  };

  return languageMap[extension] ?? 'plaintext';
}

export function getFileIcon(filename: string): string {
  if (!filename) {
    return '📄';
  }

  const extension = filename.split('.').pop()?.toLowerCase() ?? '';

  const iconMap: Record<string, string> = {
    html: '🌐',
    htm: '🌐',

    css: '🎨',
    scss: '🎨',
    sass: '🎨',
    less: '🎨',

    js: '⚡',
    mjs: '⚡',
    cjs: '⚡',

    jsx: '⚛️',

    ts: '📘',
    tsx: '⚛️',

    json: '📋',

    md: '📝',
    mdx: '📝',

    py: '🐍',

    php: '🐘',

    java: '☕',

    cs: '💜',

    cpp: '⚙️',
    c: '⚙️',

    sql: '🗄️',

    vue: '💚',

    svelte: '🧡',

    xml: '📄',

    yaml: '⚙️',
    yml: '⚙️',

    jpg: '🖼️',
    jpeg: '🖼️',
    png: '🖼️',
    gif: '🖼️',
    webp: '🖼️',
    svg: '🎭',

    mp4: '🎥',
    mp3: '🎵',

    pdf: '📕',

    zip: '🗜️',
  };

  return iconMap[extension] ?? '📄';
}
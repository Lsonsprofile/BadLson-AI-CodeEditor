export function formatHTML(code: string): string {
  try {
    let formatted = '';
    let indent = 0;
    const lines = code.split('\n');

    for (let line of lines) {
      line = line.trim();
      if (!line) continue;

      if (line.startsWith('</') || line.startsWith('}') || line.startsWith(']')) {
        indent = Math.max(0, indent - 1);
      }

      formatted += '  '.repeat(indent) + line + '\n';

      if (
        (line.startsWith('<') && !line.startsWith('</') && !line.endsWith('/>') && !line.includes('</')) ||
        line.endsWith('{') ||
        line.endsWith('[')
      ) {
        indent++;
      }
    }

    return formatted.trim();
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
      line = line.trim();
      if (!line) continue;

      if (line.includes('}')) indent = Math.max(0, indent - 1);

      formatted += '  '.repeat(indent) + line + '\n';

      if (line.includes('{')) indent++;
    }

    return formatted.trim();
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

      if (trimmed.startsWith('}') || trimmed.startsWith(']') || trimmed.startsWith(')')) {
        indent = Math.max(0, indent - 1);
      }

      if (trimmed.startsWith('else') || trimmed.startsWith('catch') || trimmed.startsWith('finally')) {
        indent = Math.max(0, indent - 1);
        formatted += '  '.repeat(indent) + trimmed + '\n';
        indent++;
        continue;
      }

      formatted += '  '.repeat(indent) + trimmed + '\n';

      if (trimmed.endsWith('{') || trimmed.endsWith('[') || trimmed.endsWith('(')) {
        indent++;
      }
    }

    return formatted.trim();
  } catch {
    return code;
  }
}

export function getFileLanguage(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const langMap: Record<string, string> = {
    html: 'html',
    htm: 'html',
    css: 'css',
    scss: 'scss',
    sass: 'sass',
    less: 'less',
    js: 'javascript',
    jsx: 'javascript',
    ts: 'typescript',
    tsx: 'typescript',
    json: 'json',
    md: 'markdown',
    py: 'python',
    php: 'php',
    vue: 'vue',
    xml: 'xml',
    yaml: 'yaml',
    yml: 'yaml',
  };
  return langMap[ext] || 'plaintext';
}

export function getFileIcon(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const iconMap: Record<string, string> = {
    html: '🌐',
    htm: '🌐',
    css: '🎨',
    scss: '🎨',
    js: '⚡',
    jsx: '⚛️',
    ts: '📘',
    tsx: '⚛️',
    json: '📋',
    md: '📝',
    py: '🐍',
    php: '🐘',
    vue: '💚',
    jpg: '🖼️',
    jpeg: '🖼️',
    png: '🖼️',
    gif: '🖼️',
    svg: '🎭',
  };
  return iconMap[ext] || '📄';
}

// src/components/Preview/LivePreview.tsx
import { useEffect, useRef, useState, useCallback } from 'react';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { Globe, RefreshCw, ExternalLink, Maximize2, Minimize2, Smartphone, Tablet, Monitor } from 'lucide-react';

export default function LivePreview() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [scale, setScale] = useState(1);
  const [iframeContent, setIframeContent] = useState('');
  const { files, previewDevice, activeFile } = useWorkspaceStore();

  const normalizeFilePath = (path: string) => path.replace(/\\+/g, '/').replace(/\/\/+/g, '/').replace(/^\//, '');
  const getFolderPath = (path: string) => {
    const index = path.lastIndexOf('/');
    return index >= 0 ? `${path.slice(0, index + 1)}` : '';
  };

  const resolveRelativePath = (relativePath: string, baseFolder: string) => {
    if (!relativePath) return null;
    if (/^(?:[a-zA-Z][a-zA-Z0-9+.-]*:|\/\/|data:)/.test(relativePath)) {
      return null;
    }

    const cleanedRelative = relativePath.replace(/^\.\//, '').replace(/^\//, '');
    const targetParts = baseFolder.split('/').filter(Boolean);
    const relativeParts = cleanedRelative.split('/').filter(Boolean);

    while (relativeParts.length && relativeParts[0] === '..') {
      if (targetParts.length > 0) targetParts.pop();
      relativeParts.shift();
    }

    const candidate = normalizeFilePath([...targetParts, ...relativeParts].join('/'));
    return candidate || null;
  };

  const getFileContent = (relativePath: string, baseFolder: string) => {
    const resolvedFile = resolveRelativePath(relativePath, baseFolder);
    if (resolvedFile && files[resolvedFile] !== undefined) {
      return files[resolvedFile];
    }
    const rootResolved = normalizeFilePath(relativePath);
    return files[rootResolved] || '';
  };

  const getContentType = (path: string) => {
    const lower = path.toLowerCase();
    if (lower.endsWith('.css')) return 'text/css';
    if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'text/html';
    if (lower.endsWith('.json')) return 'application/json';
    if (lower.endsWith('.js') || lower.endsWith('.mjs') || lower.endsWith('.cjs')) return 'application/javascript';
    if (lower.endsWith('.svg')) return 'image/svg+xml';
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
    if (lower.endsWith('.gif')) return 'image/gif';
    if (lower.endsWith('.webp')) return 'image/webp';
    if (lower.endsWith('.ico')) return 'image/x-icon';
    if (lower.endsWith('.bmp')) return 'image/bmp';
    if (lower.endsWith('.mp3')) return 'audio/mpeg';
    if (lower.endsWith('.wav')) return 'audio/wav';
    if (lower.endsWith('.mp4')) return 'video/mp4';
    if (lower.endsWith('.webm')) return 'video/webm';
    if (lower.endsWith('.ogg')) return 'audio/ogg';
    if (lower.endsWith('.ttf')) return 'font/ttf';
    if (lower.endsWith('.otf')) return 'font/otf';
    if (lower.endsWith('.woff')) return 'font/woff';
    if (lower.endsWith('.woff2')) return 'font/woff2';
    return 'application/octet-stream';
  };

  const createDataUrl = (path: string, content: string) => {
    if (content.startsWith('data:')) return content;
    const type = getContentType(path);
    if (/^text\//.test(type) || type === 'application/javascript' || type === 'application/json' || type === 'image/svg+xml') {
      return `data:${type};charset=utf-8,${encodeURIComponent(content)}`;
    }
    return '';
  };

  const getLocalDataUrl = (relativePath: string, baseFolder: string) => {
    const resolved = resolveRelativePath(relativePath, baseFolder) || normalizeFilePath(relativePath);
    if (!resolved) return null;
    const fileContent = files[resolved];
    if (typeof fileContent !== 'string') return null;
    return createDataUrl(resolved, fileContent) || null;
  };

  const rewriteCssAssetUrls = (css: string, cssFolder: string) =>
    css.replace(/url\((['"]?)(?!https?:|data:|\/\/)([^)'"\s]+)\1\)/gi, (match, quote, assetPath) => {
      const assetUrl = getLocalDataUrl(assetPath, cssFolder);
      return assetUrl ? `url(${quote || ''}${assetUrl}${quote || ''})` : match;
    });

  const inlineLocalStylesheets = (html: string, baseFolder: string) =>
    html.replace(/<link\s+[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/gi, (match, href) => {
      const css = getFileContent(href, baseFolder);
      if (!css) return match;
      const cssFolder = getFolderPath(resolveRelativePath(href, baseFolder) || normalizeFilePath(href));
      return `<style>${rewriteCssAssetUrls(css, cssFolder)}</style>`;
    });

  const inlineLocalScripts = (html: string, baseFolder: string) =>
    html.replace(/<script\b([^>]*)\bsrc=["']([^"']+)["']([^>]*)>\s*<\/script>/gi, (match, before, src, after) => {
      const scriptContent = getFileContent(src, baseFolder);
      if (!scriptContent) return match;
      return `<script${before}${after}>${scriptContent}</script>`;
    });

  const rewriteHtmlSources = (html: string, baseFolder: string) => {
    const replaceSrc = (match: string, attr: string, quote: string, value: string) => {
      const assetUrl = getLocalDataUrl(value, baseFolder);
      return assetUrl ? `${attr}=${quote}${assetUrl}${quote}` : match;
    };

    html = html.replace(/\b(src|poster|data-src)=(['"])(?!https?:|data:|\/\/)([^"']+)\2/gi, replaceSrc);
    html = html.replace(/\bsrcset=(['"])([^"']+)\1/gi, (match, quote, value) => {
      const rewritten = value
        .split(',')
        .map((item: string) => {
          const [url, descriptor] = item.trim().split(/\s+/);
          const assetUrl = getLocalDataUrl(url, baseFolder);
          return assetUrl ? `${assetUrl}${descriptor ? ' ' + descriptor : ''}` : item.trim();
        })
        .join(', ');
      return `srcset=${quote}${rewritten}${quote}`;
    });

    return html;
  };

  const findPreviewHtmlPath = () => {
    if (activeFile?.endsWith('.html') && files[activeFile]) {
      return activeFile;
    }

    if (activeFile) {
      const folder = getFolderPath(activeFile);
      const candidate = normalizeFilePath(`${folder}index.html`);
      if (files[candidate]) {
        return candidate;
      }
    }

    if (files['index.html']) {
      return 'index.html';
    }

    return Object.keys(files).find((path) => path.endsWith('/index.html')) || '';
  };

  const generatePreview = useCallback(() => {
    const htmlPath = findPreviewHtmlPath();
    const html = htmlPath && files[htmlPath] ? files[htmlPath] : '';
    const baseFolder = htmlPath ? getFolderPath(htmlPath) : '';
    const css = getFileContent('style.css', baseFolder);
    let js = getFileContent('script.js', baseFolder);

    js = stripTypeScript(js);

    if (!html) {
      return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Preview</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      width: 100%;
      height: 100%;
      background: #ffffff;
    }
  </style>
</head>
<body></body>
</html>`;
    }

    let previewHTML = html;

    if (!previewHTML.includes('<meta name="viewport"')) {
      previewHTML = previewHTML.replace(
        '<head>',
        '<head><meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">'
      );
    }

    previewHTML = inlineLocalStylesheets(previewHTML, baseFolder);
    if (css) {
      const styleTag = `<style>${rewriteCssAssetUrls(css, baseFolder)}</style>`;
      if (previewHTML.includes('</head>')) {
        previewHTML = previewHTML.replace('</head>', styleTag + '</head>');
      } else {
        previewHTML = previewHTML.replace('<head>', `<head>${styleTag}`);
      }
    }

    previewHTML = inlineLocalScripts(previewHTML, baseFolder);
    previewHTML = rewriteHtmlSources(previewHTML, baseFolder);

    if (js) {
      const wrappedJS = `
<script>
(function() {
  'use strict';
  try {
    ${js}
  } catch (err) {
    console.error('Preview script error:', err);
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#fee2e2;color:#991b1b;padding:12px;font-family:monospace;font-size:13px;z-index:99999;border-bottom:2px solid #ef4444;white-space:pre-wrap;';
    errorDiv.textContent = 'Script Error: ' + err.name + ': ' + err.message + '\\n\\n' + err.stack;
    document.body.appendChild(errorDiv);
  }
})();
</script>`;

      previewHTML = previewHTML.replace(/<script[^>]*src=["'][^"']*script\.js["'][^>]*><\/script>/gi, '');
      previewHTML = previewHTML.replace('</body>', wrappedJS + '</body>');
    }

    if (!previewHTML.includes('fonts.googleapis.com')) {
      const fontLink = '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=Fira+Code:wght@400;500&family=Poppins:wght@400;500;600;700;800&display=swap" rel="stylesheet">';
      previewHTML = previewHTML.replace('</head>', fontLink + '</head>');
    }

    if (!previewHTML.includes('<html')) {
      previewHTML = `<!DOCTYPE html><html>${previewHTML}</html>`;
    }
    if (!previewHTML.includes('<body')) {
      previewHTML = previewHTML.replace('<html>', '<html><body>');
      previewHTML = previewHTML.replace('</html>', '</body></html>');
    }

    return previewHTML;
  }, [files, activeFile]);

  useEffect(() => {
    const html = generatePreview();
    setIframeContent(html);
  }, [generatePreview]);

  useEffect(() => {
    if (iframeRef.current && iframeContent) {
      iframeRef.current.srcdoc = iframeContent;
    }
  }, [iframeContent]);

  useEffect(() => {
    const handleRun = () => {
      setIsRefreshing(true);
      const html = generatePreview();
      setIframeContent(html);
      setTimeout(() => setIsRefreshing(false), 500);
    };

    window.addEventListener('run-preview', handleRun);
    return () => window.removeEventListener('run-preview', handleRun);
  }, [generatePreview]);

  useEffect(() => {
    const calculateScale = () => {
      if (!containerRef.current || previewDevice === 'desktop') {
        setScale(1);
        return;
      }

      const container = containerRef.current;
      const containerRect = container.getBoundingClientRect();
      const containerWidth = containerRect.width - 48;
      const containerHeight = containerRect.height - 48;
      const deviceWidth = previewDevice === 'mobile' ? 375 : 768;
      const deviceHeight = previewDevice === 'mobile' ? 812 : 1024;
      const bezelPadding = 60;
      const totalWidth = deviceWidth + bezelPadding;
      const totalHeight = deviceHeight + bezelPadding;
      let fitScale = Math.min(containerWidth / totalWidth, containerHeight / totalHeight);
      fitScale = Math.min(fitScale, 1);
      fitScale = Math.max(fitScale, 0.1);
      setScale(fitScale);
    };

    const timeoutId = setTimeout(calculateScale, 50);
    const resizeObserver = new ResizeObserver(() => calculateScale());
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }
    window.addEventListener('resize', calculateScale);

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', calculateScale);
      resizeObserver.disconnect();
    };
  }, [previewDevice]);

  const getDeviceConfig = () => {
    switch (previewDevice) {
      case 'mobile':
        return {
          width: 375,
          height: 812,
          label: 'Mobile',
          icon: <Smartphone className="w-3 h-3" />,
          frameColor: 'border-slate-700',
          bgColor: 'bg-[#1a1a1a]',
          notch: true,
          borderRadius: 'rounded-[40px]',
          screenRadius: 'rounded-[32px]',
        };
      case 'tablet':
        return {
          width: 768,
          height: 1024,
          label: 'Tablet',
          icon: <Tablet className="w-3 h-3" />,
          frameColor: 'border-slate-600',
          bgColor: 'bg-[#1a1a1a]',
          notch: false,
          borderRadius: 'rounded-[30px]',
          screenRadius: 'rounded-[22px]',
        };
      case 'desktop':
      default:
        return {
          width: '100%',
          height: '100%',
          label: 'Desktop',
          icon: <Monitor className="w-3 h-3" />,
          frameColor: 'border-transparent',
          bgColor: 'bg-transparent',
          notch: false,
          borderRadius: 'rounded-none',
          screenRadius: 'rounded-none',
        };
    }
  };

  const device = getDeviceConfig();
  const isSimulated = previewDevice !== 'desktop';

  const handleRefresh = () => {
    setIsRefreshing(true);
    const html = generatePreview();
    setIframeContent(html);
    setTimeout(() => setIsRefreshing(false), 500);
  };

  const handleOpenNewTab = () => {
    const html = generatePreview();
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  };

  return (
    <div className="flex flex-col h-full w-full bg-[#0d1117]">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#161b22] border-b border-[#21262d] shrink-0">
        <div className="flex items-center gap-2">
          <Globe className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-[11px] font-semibold text-[#c9d1d9]">Preview</span>
          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#1a2035] text-[9px] text-[#8b949e]">
            {device.icon}
            {device.label}
          </span>
          {isSimulated && (
            <span className="text-[9px] text-slate-500">
              {Math.round(scale * 100)}%
            </span>
          )}
          <span className="flex items-center gap-1 ml-2">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
            </span>
            <span className="text-[9px] text-emerald-400 font-medium">Live</span>
          </span>
        </div>
        <div className="flex items-center gap-0.5">
          <button 
            onClick={handleRefresh} 
            className="p-1 text-slate-400 hover:text-white rounded hover:bg-[#30363d] transition" 
            title="Refresh"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
          <button 
            onClick={handleOpenNewTab} 
            className="p-1 text-slate-400 hover:text-white rounded hover:bg-[#30363d] transition" 
            title="Open in new tab"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
          <button 
            onClick={() => setIsFullscreen(!isFullscreen)} 
            className="p-1 text-slate-400 hover:text-white rounded hover:bg-[#30363d] transition" 
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      <div 
        ref={containerRef}
        className="flex-1 flex items-center justify-center p-2"
        style={{ 
          background: isSimulated 
            ? 'radial-gradient(ellipse at center, #1e293b 0%, #0d1117 70%)' 
            : '#ffffff',
          minHeight: '100px',
          overflow: 'hidden',
        }}
      >
        {isSimulated ? (
          <div 
            className="relative flex-shrink-0"
            style={{
              width: device.width,
              height: device.height,
              transform: `scale(${scale})`,
              transformOrigin: 'center center',
            }}
          >
            <div className={`absolute inset-0 ${device.borderRadius} ${device.bgColor} ${device.frameColor} border-[8px] shadow-2xl overflow-hidden`}>
              {device.notch && (
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-36 h-7 bg-black rounded-b-2xl z-20" />
              )}
              <div 
                className={`absolute inset-[6px] bg-white overflow-auto`} 
                style={{ 
                  borderRadius: device.notch ? '32px' : '22px',
                }}
              >
                <iframe
                  ref={iframeRef}
                  style={{
                    border: 'none',
                    display: 'block',
                    width: '100%',
                    height: '100%',
                  }}
                  sandbox="allow-scripts allow-same-origin allow-modals allow-popups"
                  title="Live Preview"
                  srcDoc={iframeContent}
                />
              </div>
              {device.notch && (
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-36 h-1 bg-slate-600 rounded-full z-20" />
              )}
            </div>
          </div>
        ) : (
          <div className="w-full h-full bg-white overflow-auto">
            <iframe
              ref={iframeRef}
              style={{
                border: 'none',
                display: 'block',
                width: '100%',
                height: '100%',
              }}
              sandbox="allow-scripts allow-same-origin allow-modals allow-popups"
              title="Live Preview"
              srcDoc={iframeContent}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function stripTypeScript(code: string): string {
  if (!code) return code;
  return code
    .replace(/\b(let|const|var)\s+(\w+)\s*:\s*[^=;]+(?==)/g, '$1 $2')
    .replace(/(\w+)\s*:\s*[\w<>\[\]|&]+\s*(?=[,)])/g, '$1')
    .replace(/\)\s*:\s*[\w<>\[\]|&]+\s*(?=\{|;|=>)/g, ')')
    .replace(/interface\s+\w+\s*\{[^}]*\}/gs, '')
    .replace(/type\s+\w+\s*=\s*[^;]+;/gs, '')
    .replace(/<\s*[\w<>\[\]|&,\s]+\s*>/g, '')
    .replace(/\s+as\s+[\w<>\[\]|&]+/g, '');
}
// src/components/Preview/LivePreview.tsx
import { useEffect, useRef, useState, useCallback } from 'react';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { getContent, getBlob } from '../../lib/fileStorage';
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

  // Async version: fetches from IndexedDB or falls back to Zustand
  const getFileContentAsync = async (relativePath: string, baseFolder: string): Promise<string> => {
    const resolvedFile = resolveRelativePath(relativePath, baseFolder);
    
    // Check Zustand first (for newly created files)
    if (resolvedFile && files[resolvedFile] !== undefined) {
      return files[resolvedFile] as string;
    }
    
    const rootResolved = normalizeFilePath(relativePath);
    if (files[rootResolved] !== undefined) {
      return files[rootResolved] as string;
    }

    // Fallback to IndexedDB
    if (resolvedFile) {
      const content = await getContent(resolvedFile);
      if (content !== null) return content;
    }
    
    const rootContent = await getContent(rootResolved);
    return rootContent || '';
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

  // Async version for blob assets (images, fonts, etc.)
  const getLocalDataUrlAsync = async (relativePath: string, baseFolder: string): Promise<string | null> => {
    const resolved = resolveRelativePath(relativePath, baseFolder) || normalizeFilePath(relativePath);
    if (!resolved) return null;

    // Check if it's an image type stored as blob
    const type = getContentType(resolved);
    if (type.startsWith('image/') || type.startsWith('font/') || type.startsWith('audio/') || type.startsWith('video/')) {
      const blob = await getBlob(resolved);
      if (blob) {
        return URL.createObjectURL(blob);
      }
    }

    // Fallback to text content
    const fileContent = files[resolved] as string | undefined;
    if (typeof fileContent === 'string') {
      return createDataUrl(resolved, fileContent) || null;
    }

    const dbContent = await getContent(resolved);
    if (dbContent !== null) {
      return createDataUrl(resolved, dbContent) || null;
    }

    return null;
  };

  const rewriteCssAssetUrls = async (css: string, cssFolder: string): Promise<string> => {
    const matches = [...css.matchAll(/url\((['"]?)(?!https?:|data:|\/\/)([^)'"\s]+)\1\)/gi)];
    let result = css;
    
    for (const match of matches) {
      const [fullMatch, quote, assetPath] = match;
      const assetUrl = await getLocalDataUrlAsync(assetPath, cssFolder);
      if (assetUrl) {
        result = result.replace(fullMatch, `url(${quote || ''}${assetUrl}${quote || ''})`);
      }
    }
    
    return result;
  };

  const inlineLocalStylesheets = async (html: string, baseFolder: string): Promise<string> => {
    const matches = [...html.matchAll(/<link\s+[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/gi)];
    let result = html;
    
    for (const match of matches) {
      const [fullMatch, href] = match;
      const css = await getFileContentAsync(href, baseFolder);
      if (!css) continue;
      
      const cssFolder = getFolderPath(resolveRelativePath(href, baseFolder) || normalizeFilePath(href));
      const rewrittenCss = await rewriteCssAssetUrls(css, cssFolder);
      result = result.replace(fullMatch, `<style>${rewrittenCss}</style>`);
    }
    
    return result;
  };

  const inlineLocalScripts = async (html: string, baseFolder: string): Promise<string> => {
    const matches = [...html.matchAll(/<script\b([^>]*)\bsrc=["']([^"']+)["']([^>]*)>\s*<\/script>/gi)];
    let result = html;
    
    for (const match of matches) {
      const [fullMatch, before, src, after] = match;
      const scriptContent = await getFileContentAsync(src, baseFolder);
      if (!scriptContent) continue;
      result = result.replace(fullMatch, `<script${before}${after}>${scriptContent}</script>`);
    }
    
    return result;
  };

  const rewriteHtmlSources = async (html: string, baseFolder: string): Promise<string> => {
    let result = html;

    // Replace src/poster/data-src attributes
    const srcMatches = [...result.matchAll(/\b(src|poster|data-src)=(['"])(?!https?:|data:|\/\/)([^"']+)\2/gi)];
    for (const match of srcMatches) {
      const [fullMatch, attr, quote, value] = match;
      const assetUrl = await getLocalDataUrlAsync(value, baseFolder);
      if (assetUrl) {
        result = result.replace(fullMatch, `${attr}=${quote}${assetUrl}${quote}`);
      }
    }

    // Replace srcset attributes
    const srcsetMatches = [...result.matchAll(/\bsrcset=(['"])([^"']+)\1/gi)];
    for (const match of srcsetMatches) {
      const [fullMatch, quote, value] = match;
      const rewritten = await Promise.all(
        value.split(',').map(async (item: string) => {
          const [url, descriptor] = item.trim().split(/\s+/);
          const assetUrl = await getLocalDataUrlAsync(url, baseFolder);
          return assetUrl ? `${assetUrl}${descriptor ? ' ' + descriptor : ''}` : item.trim();
        })
      );
      result = result.replace(fullMatch, `srcset=${quote}${rewritten.join(', ')}${quote}`);
    }

    return result;
  };

  const findPreviewHtmlPath = () => {
    if (activeFile?.endsWith('.html') && files[activeFile] !== undefined) {
      return activeFile;
    }

    if (activeFile) {
      const folder = getFolderPath(activeFile);
      const candidate = normalizeFilePath(`${folder}index.html`);
      if (files[candidate] !== undefined) {
        return candidate;
      }
    }

    if (files['index.html'] !== undefined) {
      return 'index.html';
    }

    return Object.keys(files).find((path) => path.endsWith('/index.html')) || '';
  };

  // ✅ FIXED: Helper function to safely wrap user scripts with DOM ready check
  const wrapUserScript = (js: string): string => {
    return `
<script>
(function() {
  'use strict';
  
  function safeExecute() {
    try {
      ${js}
    } catch (err) {
      console.error('Preview Script Error:', err);
      const errorDiv = document.createElement('div');
      errorDiv.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#fee2e2;color:#991b1b;padding:12px 16px;font-family:monospace;font-size:13px;z-index:99999;border-bottom:3px solid #ef4444;white-space:pre-wrap;max-height:50vh;overflow:auto;box-shadow:0 4px 12px rgba(0,0,0,0.15);';
      errorDiv.innerHTML = '<div style="font-weight:bold;margin-bottom:4px;">⚠️ JavaScript Error</div><div style="color:#b91c1c;">' + err.name + ': ' + err.message + '</div><div style="margin-top:4px;font-size:12px;color:#991b1b;opacity:0.8;">' + (err.stack || 'No stack trace') + '</div>';
      document.body.appendChild(errorDiv);
    }
  }
  
  // Wait for DOM to be ready before executing user code
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', safeExecute);
  } else {
    safeExecute();
  }
})();
</script>`;
  };

  const generatePreview = useCallback(async () => {
    const htmlPath = findPreviewHtmlPath();
    
    // Fetch HTML content from IndexedDB or Zustand
    let html = '';
    if (htmlPath) {
      if (files[htmlPath] !== undefined) {
        html = files[htmlPath] as string;
      } else {
        html = await getContent(htmlPath) || '';
      }
    }
    
    const baseFolder = htmlPath ? getFolderPath(htmlPath) : '';
    const css = await getFileContentAsync('style.css', baseFolder);
    let js = await getFileContentAsync('script.js', baseFolder);

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

    previewHTML = await inlineLocalStylesheets(previewHTML, baseFolder);
    
    if (css) {
      const styleTag = `<style>${await rewriteCssAssetUrls(css, baseFolder)}</style>`;
      if (previewHTML.includes('</head>')) {
        previewHTML = previewHTML.replace('</head>', styleTag + '</head>');
      } else {
        previewHTML = previewHTML.replace('<head>', `<head>${styleTag}`);
      }
    }

    previewHTML = await inlineLocalScripts(previewHTML, baseFolder);
    previewHTML = await rewriteHtmlSources(previewHTML, baseFolder);

    // ✅ FIXED: Use the wrapped script with DOM ready check
    if (js) {
      const wrappedJS = wrapUserScript(js);
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

  // Regenerate preview when dependencies change
  useEffect(() => {
    let cancelled = false;
    
    const buildPreview = async () => {
      const html = await generatePreview();
      if (!cancelled) {
        setIframeContent(html);
      }
    };
    
    buildPreview();
    
    return () => { cancelled = true; };
  }, [generatePreview]);

  useEffect(() => {
    if (iframeRef.current && iframeContent) {
      iframeRef.current.srcdoc = iframeContent;
    }
  }, [iframeContent]);

  useEffect(() => {
    const handleRun = async () => {
      setIsRefreshing(true);
      const html = await generatePreview();
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

  const handleRefresh = async () => {
    setIsRefreshing(true);
    const html = await generatePreview();
    setIframeContent(html);
    setTimeout(() => setIsRefreshing(false), 500);
  };

  const handleOpenNewTab = async () => {
    const html = await generatePreview();
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
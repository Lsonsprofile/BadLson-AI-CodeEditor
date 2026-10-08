// src/components/Preview/LivePreview.tsx
import { useEffect, useRef, useState, useCallback } from 'react';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { getContent, getBlob } from '../../lib/fileStorage';
import {
  Globe,
  RefreshCw,
  ExternalLink,
  Maximize2,
  Minimize2,
  Smartphone,
  Tablet,
  Monitor,
} from 'lucide-react';

const PREVIEW_SANDBOX =
  'allow-scripts allow-same-origin allow-modals allow-popups allow-forms allow-presentation allow-popups-to-escape-sandbox';
const PREVIEW_ALLOW =
  'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen; web-share';

export default function LivePreview() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [scale, setScale] = useState(1);
  const [iframeContent, setIframeContent] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const { files, previewDevice, activeFile, setPreviewDevice } = useWorkspaceStore();

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  const normalizeFilePath = (path: string) =>
    path.replace(/\\+/g, '/').replace(/\/\/+/g, '/').replace(/^\//, '');

  const getFolderPath = (path: string) => {
    const index = path.lastIndexOf('/');
    return index >= 0 ? `${path.slice(0, index + 1)}` : '';
  };

  const resolveRelativePath = (relativePath: string, baseFolder: string) => {
    if (!relativePath) return null;
    if (/^(?:[a-zA-Z][a-zA-Z0-9+.-]*:|\/\/|data:|blob:)/.test(relativePath)) return null;
    const cleanedRelative = relativePath.replace(/^\.\//, '').replace(/^\//, '');
    const targetParts = baseFolder.split('/').filter(Boolean);
    const relativeParts = cleanedRelative.split('/').filter(Boolean);
    while (relativeParts.length && relativeParts[0] === '..') {
      if (targetParts.length > 0) targetParts.pop();
      relativeParts.shift();
    }
    return normalizeFilePath([...targetParts, ...relativeParts].join('/')) || null;
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
    if (lower.endsWith('.ogg')) return 'audio/ogg';
    if (lower.endsWith('.m4a')) return 'audio/mp4';
    if (lower.endsWith('.aac')) return 'audio/aac';
    if (lower.endsWith('.mp4')) return 'video/mp4';
    if (lower.endsWith('.webm')) return 'video/webm';
    if (lower.endsWith('.ogv')) return 'video/ogg';
    if (lower.endsWith('.mov')) return 'video/quicktime';
    if (lower.endsWith('.ttf')) return 'font/ttf';
    if (lower.endsWith('.otf')) return 'font/otf';
    if (lower.endsWith('.woff')) return 'font/woff';
    if (lower.endsWith('.woff2')) return 'font/woff2';
    return 'application/octet-stream';
  };

  const getFileContentAsync = async (relativePath: string, baseFolder: string): Promise<string> => {
    const resolvedFile = resolveRelativePath(relativePath, baseFolder);
    if (resolvedFile && files[resolvedFile] !== undefined) return files[resolvedFile] as string;
    const rootResolved = normalizeFilePath(relativePath);
    if (files[rootResolved] !== undefined) return files[rootResolved] as string;
    if (resolvedFile) {
      const content = await getContent(resolvedFile);
      if (content !== null) return content;
    }
    return (await getContent(rootResolved)) || '';
  };

  const getLocalDataUrlAsync = async (
    relativePath: string,
    baseFolder: string
  ): Promise<string | null> => {
    const resolved =
      resolveRelativePath(relativePath, baseFolder) || normalizeFilePath(relativePath);
    if (!resolved) return null;

    const typeFromExtension = getContentType(resolved);
    const isBinary =
      typeFromExtension.startsWith('image/') ||
      typeFromExtension.startsWith('video/') ||
      typeFromExtension.startsWith('audio/') ||
      typeFromExtension.startsWith('font/');

    if (isBinary) {
      const blob = await getBlob(resolved);
      if (blob) {
        const typedBlob = new Blob([blob], { type: typeFromExtension });
        return URL.createObjectURL(typedBlob);
      }
    }

    const fileContent = files[resolved] as string | undefined;
    const dbContent = fileContent !== undefined ? fileContent : await getContent(resolved);
    if (!dbContent) return null;

    if (dbContent.startsWith('data:') || dbContent.startsWith('blob:')) return dbContent;

    if (
      /^text\//.test(typeFromExtension) ||
      typeFromExtension.includes('javascript') ||
      typeFromExtension.includes('json') ||
      typeFromExtension.includes('svg')
    ) {
      return `data:${typeFromExtension};charset=utf-8,${encodeURIComponent(dbContent)}`;
    }

    try {
      if (/^[A-Za-z0-9+/=]+$/.test(dbContent.slice(0, 80)) && dbContent.length > 100) {
        return `data:${typeFromExtension};base64,${dbContent}`;
      }
    } catch {
      /* ignore */
    }

    return null;
  };

  const rewriteCssAssetUrls = async (css: string, cssFolder: string): Promise<string> => {
    const matches = [
      ...css.matchAll(/url\((['"]?)(?!https?:|data:|blob:|\/\/)([^)'"\s]+)\1\)/gi),
    ];
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
    const matches = [
      ...html.matchAll(/<link\s+[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/gi),
    ];
    let result = html;
    for (const match of matches) {
      const [fullMatch, href] = match;
      const css = await getFileContentAsync(href, baseFolder);
      if (!css) continue;
      const cssFolder = getFolderPath(
        resolveRelativePath(href, baseFolder) || normalizeFilePath(href)
      );
      const rewrittenCss = await rewriteCssAssetUrls(css, cssFolder);
      result = result.replace(fullMatch, `<style>${rewrittenCss}</style>`);
    }
    return result;
  };

  const inlineLocalScripts = async (html: string, baseFolder: string): Promise<string> => {
    const matches = [
      ...html.matchAll(/<script\b([^>]*)\bsrc=["']([^"']+)["']([^>]*)>\s*<\/script>/gi),
    ];
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

    const srcMatches = [
      ...result.matchAll(
        /\b(src|poster|data-src)=(['"])(?!https?:|data:|blob:|\/\/)([^"']+)\2/gi
      ),
    ];
    for (const match of srcMatches) {
      const [fullMatch, attr, quote, value] = match;
      const assetUrl = await getLocalDataUrlAsync(value, baseFolder);
      if (assetUrl) {
        result = result.replace(fullMatch, `${attr}=${quote}${assetUrl}${quote}`);
      }
    }

    const sourceMatches = [
      ...result.matchAll(/<source\b([^>]*)\bsrc=(['"])(?!https?:|data:|blob:|\/\/)([^"']+)\2([^>]*)>/gi),
    ];
    for (const match of sourceMatches) {
      const [fullMatch, before, quote, value, after] = match;
      const assetUrl = await getLocalDataUrlAsync(value, baseFolder);
      if (assetUrl) {
        result = result.replace(
          fullMatch,
          `<source${before}src=${quote}${assetUrl}${quote}${after}>`
        );
      }
    }

    // Help playback UX
    result = result.replace(/<video(?![^>]*\bcontrols\b)/gi, '<video controls');
    result = result.replace(/<audio(?![^>]*\bcontrols\b)/gi, '<audio controls');

    return result;
  };

  const findPreviewHtmlPath = () => {
    if (activeFile?.endsWith('.html') && files[activeFile] !== undefined) return activeFile;
    if (activeFile) {
      const folder = getFolderPath(activeFile);
      const candidate = normalizeFilePath(`${folder}index.html`);
      if (files[candidate] !== undefined) return candidate;
    }
    if (files['index.html'] !== undefined) return 'index.html';
    return Object.keys(files).find((p) => p.toLowerCase().endsWith('.html')) || '';
  };

  const generatePreview = useCallback(async () => {
    const htmlPath = findPreviewHtmlPath();
    let html = '';
    if (htmlPath) {
      html = (files[htmlPath] as string) || (await getContent(htmlPath)) || '';
    }
    const baseFolder = htmlPath ? getFolderPath(htmlPath) : '';

    if (!html) {
      return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Preview</title>
  <style>
    body { margin:0; font-family: system-ui, sans-serif; display:flex; align-items:center; justify-content:center; min-height:100vh; background:#f8fafc; color:#64748b; }
  </style>
</head>
<body><p>No HTML file to preview. Create index.html or open an HTML file.</p></body>
</html>`;
    }

    let previewHTML = html;
    if (!previewHTML.includes('viewport')) {
      previewHTML = previewHTML.replace(
        /<head>/i,
        '<head><meta name="viewport" content="width=device-width, initial-scale=1.0">'
      );
    }

    previewHTML = await inlineLocalStylesheets(previewHTML, baseFolder);
    previewHTML = await inlineLocalScripts(previewHTML, baseFolder);
    previewHTML = await rewriteHtmlSources(previewHTML, baseFolder);

    if (!previewHTML.includes('<html')) {
      previewHTML = `<!DOCTYPE html><html>${previewHTML}</html>`;
    }
    return previewHTML;
  }, [files, activeFile]);

  useEffect(() => {
    let cancelled = false;
    generatePreview().then((html) => {
      if (!cancelled) setIframeContent(html);
    });
    return () => {
      cancelled = true;
    };
  }, [generatePreview]);

  useEffect(() => {
    if (iframeRef.current && iframeContent) {
      iframeRef.current.srcdoc = iframeContent;
    }
  }, [iframeContent]);

  useEffect(() => {
    const calculateScale = () => {
      if (!containerRef.current || previewDevice === 'desktop') {
        setScale(1);
        return;
      }
      const rect = containerRef.current.getBoundingClientRect();
      const deviceWidth = previewDevice === 'mobile' ? 375 : 768;
      const deviceHeight = previewDevice === 'mobile' ? 812 : 1024;
      const fit = Math.min(
        (rect.width - 48) / (deviceWidth + 40),
        (rect.height - 48) / (deviceHeight + 40),
        1
      );
      setScale(Math.max(fit, 0.25));
    };
    calculateScale();
    const ro = new ResizeObserver(calculateScale);
    if (containerRef.current) ro.observe(containerRef.current);
    window.addEventListener('resize', calculateScale);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', calculateScale);
    };
  }, [previewDevice]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      setIframeContent(await generatePreview());
    } finally {
      setTimeout(() => setIsRefreshing(false), 400);
    }
  };

  const handleOpenNewPage = async () => {
    try {
      const html = await generatePreview();
      const blob = new Blob([html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const win = window.open(url, '_blank');
      if (!win) {
        const a = document.createElement('a');
        a.href = url;
        a.download = 'preview.html';
        a.click();
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      console.error('Open in new page failed:', err);
    }
  };

  const handleFullscreen = async () => {
    const el = containerRef.current;
    if (!el) return;
    try {
      if (!document.fullscreenElement) {
        await el.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (err) {
      console.error('Fullscreen failed:', err);
    }
  };

  const deviceWidth =
    previewDevice === 'mobile' ? 375 : previewDevice === 'tablet' ? 768 : '100%';
  const deviceHeight =
    previewDevice === 'mobile' ? 812 : previewDevice === 'tablet' ? 1024 : '100%';

  const btnClass = (active: boolean) =>
    `p-1.5 rounded transition ${active ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-700/50'}`;

  return (
    <div className="flex flex-col h-full w-full bg-[#0d1117]" ref={containerRef}>
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#161b22] border-b border-[#21262d] shrink-0">
        <div className="flex items-center gap-2">
          <Globe className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-[11px] font-semibold text-[#c9d1d9]">Preview</span>
          <div className="flex items-center gap-0.5 ml-1">
            <button
              onClick={() => setPreviewDevice('mobile')}
              className={btnClass(previewDevice === 'mobile')}
              title="Mobile"
            >
              <Smartphone className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setPreviewDevice('tablet')}
              className={btnClass(previewDevice === 'tablet')}
              title="Tablet"
            >
              <Tablet className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setPreviewDevice('desktop')}
              className={btnClass(previewDevice === 'desktop')}
              title="Desktop"
            >
              <Monitor className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-0.5">
          <button
            onClick={handleRefresh}
            className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-slate-700/50 transition"
            title="Refresh preview"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={handleOpenNewPage}
            className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-slate-700/50 transition"
            title="Open in new page"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleFullscreen}
            className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-slate-700/50 transition"
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? (
              <Minimize2 className="w-3.5 h-3.5" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto flex items-center justify-center p-4 bg-[#0d1117]">
        <div
          style={{
            width: deviceWidth,
            height: deviceHeight,
            maxWidth: '100%',
            maxHeight: '100%',
            transform: previewDevice !== 'desktop' ? `scale(${scale})` : undefined,
            transformOrigin: 'center center',
          }}
          className={
            previewDevice !== 'desktop'
              ? 'border border-slate-700 rounded-2xl overflow-hidden shadow-xl bg-white'
              : 'w-full h-full'
          }
        >
          <iframe
            ref={iframeRef}
            title="preview"
            className="w-full h-full bg-white border-0"
            sandbox={PREVIEW_SANDBOX}
            allow={PREVIEW_ALLOW}
            srcDoc={iframeContent}
          />
        </div>
      </div>
    </div>
  );
}

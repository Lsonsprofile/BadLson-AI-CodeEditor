// src/components/Preview/LivePreview.tsx
// Restored - video sandbox permissions enabled
import { useEffect, useRef, useState, useCallback } from 'react';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { getContent, getBlob } from '../../lib/fileStorage';
import { Globe, RefreshCw, ExternalLink, Maximize2, Minimize2, Smartphone, Tablet, Monitor } from 'lucide-react';

const PREVIEW_SANDBOX =
  'allow-scripts allow-same-origin allow-modals allow-popups allow-forms allow-presentation allow-popups-to-escape-sandbox';
const PREVIEW_ALLOW =
  'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen';

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
    if (/^(?:[a-zA-Z][a-zA-Z0-9+.-]*:|\/\/|data:)/.test(relativePath)) return null;
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
    if (lower.endsWith('.mp4')) return 'video/mp4';
    if (lower.endsWith('.webm')) return 'video/webm';
    if (lower.endsWith('.mp3')) return 'audio/mpeg';
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

  const getLocalDataUrlAsync = async (relativePath: string, baseFolder: string): Promise<string | null> => {
    const resolved = resolveRelativePath(relativePath, baseFolder) || normalizeFilePath(relativePath);
    if (!resolved) return null;
    const typeFromExtension = getContentType(resolved);
    if (typeFromExtension.startsWith('image/') || typeFromExtension.startsWith('video/') || typeFromExtension.startsWith('audio/')) {
      const blob = await getBlob(resolved);
      if (blob) return URL.createObjectURL(new Blob([blob], { type: typeFromExtension }));
    }
    const fileContent = files[resolved] as string | undefined;
    const dbContent = fileContent !== undefined ? fileContent : await getContent(resolved);
    if (!dbContent) return null;
    if (dbContent.startsWith('data:')) return dbContent;
    if (/^text\//.test(typeFromExtension) || typeFromExtension.includes('javascript') || typeFromExtension.includes('json') || typeFromExtension.includes('svg')) {
      return `data:${typeFromExtension};charset=utf-8,${encodeURIComponent(dbContent)}`;
    }
    return null;
  };

  const rewriteHtmlSources = async (html: string, baseFolder: string): Promise<string> => {
    let result = html;
    const srcMatches = [...result.matchAll(/\b(src|poster|data-src)=(['"])(?!https?:|data:|\/\/)([^"']+)\2/gi)];
    for (const match of srcMatches) {
      const [fullMatch, attr, quote, value] = match;
      const assetUrl = await getLocalDataUrlAsync(value, baseFolder);
      if (assetUrl) result = result.replace(fullMatch, `${attr}=${quote}${assetUrl}${quote}`);
    }
    return result;
  };

  const inlineLocalStylesheets = async (html: string, baseFolder: string): Promise<string> => {
    const matches = [...html.matchAll(/<link\s+[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/gi)];
    let result = html;
    for (const match of matches) {
      const [fullMatch, href] = match;
      const css = await getFileContentAsync(href, baseFolder);
      if (css) result = result.replace(fullMatch, `<style>${css}</style>`);
    }
    return result;
  };

  const inlineLocalScripts = async (html: string, baseFolder: string): Promise<string> => {
    const matches = [...html.matchAll(/<script\b([^>]*)\bsrc=["']([^"']+)["']([^>]*)>\s*<\/script>/gi)];
    let result = html;
    for (const match of matches) {
      const [fullMatch, before, src, after] = match;
      const scriptContent = await getFileContentAsync(src, baseFolder);
      if (scriptContent) result = result.replace(fullMatch, `<script${before}${after}>${scriptContent}</script>`);
    }
    return result;
  };

  const findPreviewHtmlPath = () => {
    if (activeFile?.endsWith('.html') && files[activeFile] !== undefined) return activeFile;
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
      return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Preview</title></head><body></body></html>`;
    }
    let previewHTML = html;
    if (!previewHTML.includes('viewport')) {
      previewHTML = previewHTML.replace('<head>', '<head><meta name="viewport" content="width=device-width, initial-scale=1.0">');
    }
    previewHTML = await inlineLocalStylesheets(previewHTML, baseFolder);
    previewHTML = await inlineLocalScripts(previewHTML, baseFolder);
    previewHTML = await rewriteHtmlSources(previewHTML, baseFolder);
    if (!previewHTML.includes('<html')) previewHTML = `<!DOCTYPE html><html>${previewHTML}</html>`;
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
    if (iframeRef.current && iframeContent) iframeRef.current.srcdoc = iframeContent;
  }, [iframeContent]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      setIframeContent(await generatePreview());
    } finally {
      setTimeout(() => setIsRefreshing(false), 400);
    }
  };

  const deviceWidth = previewDevice === 'mobile' ? 375 : previewDevice === 'tablet' ? 768 : '100%';
  const deviceHeight = previewDevice === 'mobile' ? 812 : previewDevice === 'tablet' ? 1024 : '100%';

  return (
    <div className="flex flex-col h-full w-full bg-[#0d1117]" ref={containerRef}>
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#161b22] border-b border-[#21262d] shrink-0">
        <div className="flex items-center gap-2">
          <Globe className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-[11px] font-semibold text-[#c9d1d9]">Preview</span>
          <div className="flex items-center gap-0.5 ml-1">
            <button onClick={() => setPreviewDevice('mobile')} className={`p-1 rounded ${previewDevice === 'mobile' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`} title="Mobile">
              <Smartphone className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => setPreviewDevice('tablet')} className={`p-1 rounded ${previewDevice === 'tablet' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`} title="Tablet">
              <Tablet className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => setPreviewDevice('desktop')} className={`p-1 rounded ${previewDevice === 'desktop' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`} title="Desktop">
              <Monitor className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={handleRefresh} className="p-1.5 rounded text-slate-400 hover:text-white" title="Refresh">
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
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
          }}
          className={previewDevice !== 'desktop' ? 'border border-slate-700 rounded-2xl overflow-hidden shadow-xl' : 'w-full h-full'}
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

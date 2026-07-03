import { useEffect, useRef, useState, useCallback } from 'react';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { Globe, RefreshCw, ExternalLink, Maximize2, Minimize2 } from 'lucide-react';

export default function LivePreview() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { files, previewDevice } = useWorkspaceStore();

  const generatePreview = useCallback(() => {
    const html = files['index.html'] || '<!DOCTYPE html><html><head></head><body></body></html>';
    const css = files['style.css'] || '';
    let js = files['script.js'] || '';

    // Strip TypeScript annotations before injecting into browser
    js = stripTypeScript(js);

    let previewHTML = html;

    // Inject CSS
    if (css) {
      previewHTML = previewHTML.replace(
        /<link[^>]*href=["']style\.css["'][^>]*>/i,
        `<style>${escapeHtml(css)}</style>`
      );
      if (!previewHTML.includes('<style>')) {
        previewHTML = previewHTML.replace('</head>', `<style>${escapeHtml(css)}</style></head>`);
      }
    }

    // Inject JS with error handling wrapper
    if (js) {
      const wrappedJS = `
<script>
(function() {
  'use strict';
  try {
    ${js}
  } catch (err) {
    console.error('Preview script error:', err);
    var errorDiv = document.createElement('div');
    errorDiv.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#fee2e2;color:#991b1b;padding:12px;font-family:monospace;font-size:13px;z-index:99999;border-bottom:2px solid #ef4444;white-space:pre-wrap;';
    errorDiv.textContent = 'Script Error: ' + err.name + ': ' + err.message + '\\n\\n' + err.stack;
    document.body.appendChild(errorDiv);
  }
})();
</script>`;

      previewHTML = previewHTML.replace(
        /<script[^>]*src=["']script\.js["'][^>]*><\/script>/i,
        wrappedJS
      );
      if (!previewHTML.includes('<script>')) {
        previewHTML = previewHTML.replace('</body>', wrappedJS + '</body>');
      }
    }

    // Add fonts
    if (!previewHTML.includes('fonts.googleapis.com')) {
      previewHTML = previewHTML.replace(
        '</head>',
        `<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=Fira+Code:wght@400;500&family=Poppins:wght@400;500;600;700;800&display=swap" rel="stylesheet"></head>`
      );
    }

    return previewHTML;
  }, [files]);

  useEffect(() => {
    const html = generatePreview();
    if (iframeRef.current) {
      iframeRef.current.srcdoc = html;
    }
  }, [generatePreview]);

  useEffect(() => {
    const handleRun = () => {
      setIsRefreshing(true);
      const html = generatePreview();
      if (iframeRef.current) {
        iframeRef.current.srcdoc = html;
      }
      setTimeout(() => setIsRefreshing(false), 500);
    };

    window.addEventListener('run-preview', handleRun);
    return () => window.removeEventListener('run-preview', handleRun);
  }, [generatePreview]);

  const getDeviceStyles = () => {
    return { width: '100%', height: '100%', maxWidth: '100%' };
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    const html = generatePreview();
    if (iframeRef.current) {
      iframeRef.current.srcdoc = html;
    }
    setTimeout(() => setIsRefreshing(false), 500);
  };

  const handleOpenNewTab = () => {
    const html = generatePreview();
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  };

  return (
    <div
      className={`flex flex-col bg-white rounded-sm border border-[#1e293b] overflow-hidden transition-all duration-300 ${
        isFullscreen ? 'fixed inset-0 z-[100] rounded-none' : 'flex-1 min-h-0 h-full'
      }`}
      style={isFullscreen ? undefined : { minHeight: 0 }}
    >
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#f8fafc] border-b border-[#e2e8f0] shrink-0">
        <div className="flex items-center gap-2">
          <Globe className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-[11px] font-semibold text-slate-600">Live Preview</span>
          <span className="flex items-center gap-1 ml-2">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
            </span>
            <span className="text-[9px] text-emerald-500 font-medium">Synced</span>
          </span>
        </div>
        <div className="flex items-center gap-0.5">
          <button onClick={handleRefresh} className="p-1 text-slate-400 hover:text-slate-700 rounded hover:bg-slate-200 transition" title="Refresh">
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={handleOpenNewTab} className="p-1 text-slate-400 hover:text-slate-700 rounded hover:bg-slate-200 transition" title="Open in new tab">
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => setIsFullscreen(!isFullscreen)} className="p-1 text-slate-400 hover:text-slate-700 rounded hover:bg-slate-200 transition" title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 h-full bg-[#f1f5f9] p-2 overflow-hidden transition-all duration-300">
        <div className="w-full h-full bg-white rounded shadow-sm border border-slate-200 transition-all duration-300 overflow-hidden" style={getDeviceStyles()}>
          <iframe
            ref={iframeRef}
            className="w-full h-full rounded"
            sandbox="allow-scripts allow-same-origin allow-modals allow-popups"
            title="Live Preview"
          />
        </div>
      </div>
    </div>
  );
}

// Strip TypeScript type annotations from JavaScript before injecting into iframe
function stripTypeScript(code: string): string {
  if (!code) return code;

  return code
    // Remove variable type annotations: let x: string = ...
    .replace(/\b(let|const|var)\s+(\w+)\s*:\s*[\w<>\[\]|&]+\s*=/g, '$1 $2 =')
    // Remove parameter types in arrow function params with => : (param: Type) => {
    .replace(/\(([^)]*)\)\s*:\s*[\w<>\[\]|&]+\s*=>\s*\{/g, (match, params) => {
      const cleanParams = params.replace(/\s*:\s*[\w<>\[\]|&]+/g, '');
      return `(${cleanParams}) => {`;
    })
    // Remove parameter types in forEach/map callbacks: (section: Element) => {
    .replace(/\(([^)]*)\)\s*=>\s*\{/g, (match, params) => {
      const cleanParams = params.replace(/\s*:\s*[\w<>\[\]|&]+/g, '');
      return `(${cleanParams}) => {`;
    })
    // Remove parameter types in regular function params: function foo(param: Type)
    .replace(/function\s+(\w+)\s*\(([^)]*)\)/g, (match, name, params) => {
      const cleanParams = params.replace(/\s*:\s*[\w<>\[\]|&]+/g, '');
      return `function ${name}(${cleanParams})`;
    })
    // Remove 'as Type' casts: (section as HTMLElement)
    .replace(/\(\s*\w+\s+as\s+\w+\s*\)/g, (match) => {
      return match.replace(/\s+as\s+\w+/, '').replace(/[()]/g, '');
    })
    // Remove standalone 'as Type' casts
    .replace(/\s+as\s+\w+/g, '')
    // Remove interface declarations
    .replace(/interface\s+\w+\s*\{[^}]*\}/g, '')
    // Remove type aliases
    .replace(/type\s+\w+\s*=\s*[^;]+;/g, '');
}

// Helper to prevent XSS in CSS content
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
// src/components/Modals/ShareModal.tsx
import { useState, useEffect } from 'react';
import { 
  X, Copy, Check, Globe, Lock, 
  Download, FileCode, Share2, 
  Smartphone, Monitor, Tablet,
  ExternalLink
} from 'lucide-react';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentFile?: string;
  projectFiles?: Record<string, string>;
}

export default function ShareModal({ isOpen, onClose, currentFile, projectFiles = {} }: ShareModalProps) {
  const [privacy, setPrivacy] = useState<'private' | 'public'>('public');
  const [copied, setCopied] = useState(false);
  const [permission, setPermission] = useState<'readonly' | 'canedit'>('readonly');
  const [isNativeShareSupported, setIsNativeShareSupported] = useState(false);
  
  const shareLink = 'https://badlson.app/p/4jH2Ks';

  // Check if Web Share API is supported
  useEffect(() => {
    // Check if navigator.share exists and is a function
    setIsNativeShareSupported(
      typeof navigator !== 'undefined' && 
      typeof navigator.share === 'function'
    );
  }, []);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = shareLink;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Native Share API - works on both desktop and mobile
  const handleNativeShare = async () => {
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({
          title: 'My Project on BadLson AI Code Editor',
          text: 'Check out my project!',
          url: shareLink,
        });
      } else {
        // Fallback to copy link if share is not available
        await handleCopyLink();
      }
    } catch (error) {
      // User cancelled or share failed
      if (error instanceof Error && error.name !== 'AbortError') {
        console.error('Share failed:', error);
        // Fallback to copy link
        await handleCopyLink();
      }
    }
  };

  // Share via specific platform (fallback for native share)
  const handleShareVia = (platform: string) => {
    const message = encodeURIComponent(`Check out my project on BadLson AI Code Editor: ${shareLink}`);
    const urls: Record<string, string> = {
      whatsapp: `https://wa.me/?text=${message}`,
      telegram: `https://t.me/share/url?url=${shareLink}&text=${message}`,
      email: `mailto:?subject=My Project&body=${message}`,
      twitter: `https://twitter.com/intent/tweet?text=${message}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${shareLink}`,
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${shareLink}`,
    };
    
    if (urls[platform]) {
      window.open(urls[platform], '_blank');
    }
  };

  const handleDownloadProject = () => {
    // Download entire project as ZIP
    window.dispatchEvent(new CustomEvent('download-project'));
    onClose();
  };

  const handleDownloadFile = () => {
    if (!currentFile || !projectFiles[currentFile]) return;
    const content = projectFiles[currentFile];
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = currentFile;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-[#161b22] border border-[#30363d] rounded-lg shadow-2xl w-[520px] max-w-[90vw] max-h-[85vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#30363d] sticky top-0 bg-[#161b22] z-10">
          <div className="flex items-center gap-2">
            <Share2 className="w-4 h-4 text-[#58a6ff]" />
            <h2 className="text-sm font-semibold text-[#c9d1d9]">Share Project</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white hover:bg-[#21262d] rounded transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4">
          {/* Native Share - Primary Action */}
          {isNativeShareSupported && (
            <button
              onClick={handleNativeShare}
              className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 rounded-lg text-white text-[13px] font-medium transition shadow-lg shadow-indigo-900/20"
            >
              <Share2 className="w-4 h-4" />
              Share via {navigator.userAgent.includes('Mobile') ? 'App' : 'System'}
              <span className="text-[10px] opacity-60 ml-auto">
                {navigator.userAgent.includes('Mobile') ? '📱' : '💻'}
              </span>
            </button>
          )}

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[#30363d]"></div>
            </div>
            <div className="relative flex justify-center text-[10px]">
              <span className="px-2 bg-[#161b22] text-[#8b949e]">
                {isNativeShareSupported ? 'Or share via' : 'Share via'}
              </span>
            </div>
          </div>

          {/* Share via Platforms - Grid Layout */}
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
            <button
              onClick={() => handleShareVia('whatsapp')}
              className="flex flex-col items-center gap-1 px-2 py-2 bg-[#25D366]/5 hover:bg-[#25D366]/15 rounded-md transition border border-[#25D366]/10"
            >
              <span className="text-[20px]">💬</span>
              <span className="text-[9px] text-[#8b949e]">WhatsApp</span>
            </button>
            <button
              onClick={() => handleShareVia('telegram')}
              className="flex flex-col items-center gap-1 px-2 py-2 bg-[#0088cc]/5 hover:bg-[#0088cc]/15 rounded-md transition border border-[#0088cc]/10"
            >
              <span className="text-[20px]">✈️</span>
              <span className="text-[9px] text-[#8b949e]">Telegram</span>
            </button>
            <button
              onClick={() => handleShareVia('email')}
              className="flex flex-col items-center gap-1 px-2 py-2 bg-[#EA4335]/5 hover:bg-[#EA4335]/15 rounded-md transition border border-[#EA4335]/10"
            >
              <span className="text-[20px]">📧</span>
              <span className="text-[9px] text-[#8b949e]">Email</span>
            </button>
            <button
              onClick={() => handleShareVia('twitter')}
              className="flex flex-col items-center gap-1 px-2 py-2 bg-[#1DA1F2]/5 hover:bg-[#1DA1F2]/15 rounded-md transition border border-[#1DA1F2]/10"
            >
              <span className="text-[20px]">🐦</span>
              <span className="text-[9px] text-[#8b949e]">X</span>
            </button>
            <button
              onClick={() => handleShareVia('facebook')}
              className="flex flex-col items-center gap-1 px-2 py-2 bg-[#1877F2]/5 hover:bg-[#1877F2]/15 rounded-md transition border border-[#1877F2]/10"
            >
              <span className="text-[20px]">👍</span>
              <span className="text-[9px] text-[#8b949e]">Facebook</span>
            </button>
            <button
              onClick={() => handleShareVia('linkedin')}
              className="flex flex-col items-center gap-1 px-2 py-2 bg-[#0A66C2]/5 hover:bg-[#0A66C2]/15 rounded-md transition border border-[#0A66C2]/10"
            >
              <span className="text-[20px]">💼</span>
              <span className="text-[9px] text-[#8b949e]">LinkedIn</span>
            </button>
            <button
              onClick={handleCopyLink}
              className="flex flex-col items-center gap-1 px-2 py-2 bg-[#1f6feb]/5 hover:bg-[#1f6feb]/15 rounded-md transition border border-[#1f6feb]/10"
            >
              <span className="text-[20px]">🔗</span>
              <span className="text-[9px] text-[#8b949e]">Copy Link</span>
            </button>
            <button
              onClick={() => {
                if (typeof navigator.share === 'function') {
                  handleNativeShare();
                } else {
                  handleCopyLink();
                }
              }}
              className="flex flex-col items-center gap-1 px-2 py-2 bg-[#238636]/5 hover:bg-[#238636]/15 rounded-md transition border border-[#238636]/10"
            >
              <span className="text-[20px]">📱</span>
              <span className="text-[9px] text-[#8b949e]">Share</span>
            </button>
          </div>

          {/* Privacy Settings */}
          <div className="border-t border-[#30363d] pt-4">
            <label className="text-[11px] font-medium text-[#8b949e] block mb-1.5">Privacy</label>
            <div className="flex gap-2">
              <button
                onClick={() => setPrivacy('public')}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-[11px] rounded-md border transition ${
                  privacy === 'public'
                    ? 'border-[#58a6ff] bg-[#1f6feb]/20 text-[#58a6ff]'
                    : 'border-[#30363d] text-[#8b949e] hover:border-[#484f58] hover:text-[#c9d1d9]'
                }`}
              >
                <Globe className="w-3.5 h-3.5" />
                Public
              </button>
              <button
                onClick={() => setPrivacy('private')}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-[11px] rounded-md border transition ${
                  privacy === 'private'
                    ? 'border-[#58a6ff] bg-[#1f6feb]/20 text-[#58a6ff]'
                    : 'border-[#30363d] text-[#8b949e] hover:border-[#484f58] hover:text-[#c9d1d9]'
                }`}
              >
                <Lock className="w-3.5 h-3.5" />
                Private
              </button>
            </div>
          </div>

          {/* Share Link with Copy */}
          <div>
            <label className="text-[11px] font-medium text-[#8b949e] block mb-1.5">Share Link</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={shareLink}
                readOnly
                className="flex-1 bg-[#0d1117] border border-[#30363d] rounded-md px-2.5 py-1.5 text-[11px] text-[#c9d1d9] outline-none focus:border-[#58a6ff]"
              />
              <button
                onClick={handleCopyLink}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1f6feb] hover:bg-[#58a6ff] rounded-md text-[11px] text-white transition flex-shrink-0"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>

          {/* Generate New Link */}
          <button
            onClick={() => alert('Generating new share link...')}
            className="text-[11px] text-[#58a6ff] hover:underline"
          >
            Generate New Link
          </button>

          {/* Permissions */}
          <div className="border-t border-[#30363d] pt-4">
            <label className="text-[11px] font-medium text-[#8b949e] block mb-1.5">Allow Viewers</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-[11px] text-[#c9d1d9] cursor-pointer">
                <input
                  type="radio"
                  checked={permission === 'readonly'}
                  onChange={() => setPermission('readonly')}
                  className="w-3.5 h-3.5 accent-[#58a6ff]"
                />
                <span>Read only</span>
              </label>
              <label className="flex items-center gap-2 text-[11px] text-[#c9d1d9] cursor-pointer">
                <input
                  type="radio"
                  checked={permission === 'canedit'}
                  onChange={() => setPermission('canedit')}
                  className="w-3.5 h-3.5 accent-[#58a6ff]"
                />
                <span>Can edit</span>
              </label>
            </div>
          </div>

          {/* Download Section */}
          <div className="border-t border-[#30363d] pt-4">
            <label className="text-[11px] font-medium text-[#8b949e] block mb-2">Download</label>
            <div className="flex flex-col sm:flex-row gap-2">
              <button
                onClick={handleDownloadFile}
                disabled={!currentFile}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-[11px] bg-[#21262d] hover:bg-[#30363d] disabled:opacity-50 disabled:cursor-not-allowed text-[#c9d1d9] rounded-md transition"
              >
                <FileCode className="w-3.5 h-3.5" />
                Current File {currentFile && `(${currentFile})`}
              </button>
              <button
                onClick={handleDownloadProject}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-[11px] bg-[#238636] hover:bg-[#2ea043] text-white rounded-md transition"
              >
                <Download className="w-3.5 h-3.5" />
                Full Project (ZIP)
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end px-4 py-3 border-t border-[#30363d] gap-2 sticky bottom-0 bg-[#161b22]">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-[11px] text-[#8b949e] hover:text-[#c9d1d9] hover:bg-[#21262d] rounded-md transition"
          >
            Close
          </button>
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-[11px] bg-[#238636] hover:bg-[#2ea043] text-white rounded-md transition"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
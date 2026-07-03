import { useState } from 'react';
import { Check, Copy, Wand2, User } from 'lucide-react';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { parseCodeBlocks } from '../../utils/helpers';

interface MessageProps {
  role: string;
  content: string;
  timestamp: number;
}

export default function Message({ role, content, timestamp }: MessageProps) {
  const [copiedBlock, setCopiedBlock] = useState<number | null>(null);
  const isAI = role === 'ai' || role === 'assistant';
  const codeBlocks = parseCodeBlocks(content);
  const textContent = content.replace(/```[\w]*\n[\s\S]*?```/g, '');

  const handleCopy = (code: string, index: number) => {
    navigator.clipboard.writeText(code);
    setCopiedBlock(index);
    setTimeout(() => setCopiedBlock(null), 2000);
  };

  const handleApply = (code: string, language: string) => {
    const { updateFile } = useWorkspaceStore.getState();

    let targetFile = 'index.html';
    if (language === 'css') targetFile = 'style.css';
    if (language === 'javascript' || language === 'js') targetFile = 'script.js';

    updateFile(targetFile, code);

    const toast = document.getElementById('toast');
    const toastMsg = document.getElementById('toastMsg');
    if (toast && toastMsg) {
      toastMsg.textContent = `Applied changes to ${targetFile}`;
      toast.classList.remove('opacity-0', 'pointer-events-none');
      toast.classList.add('opacity-100');
      setTimeout(() => {
        toast.classList.remove('opacity-100');
        toast.classList.add('opacity-0', 'pointer-events-none');
      }, 3000);
    }
  };

  return (
    <div className="flex items-start gap-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div
        className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${
          isAI ? 'bg-violet-600 shadow-md shadow-violet-900/20' : 'bg-slate-700'
        }`}
      >
        {isAI ? (
          <Wand2 className="w-3.5 h-3.5 text-white" />
        ) : (
          <User className="w-3.5 h-3.5 text-white" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div
          className={`rounded-lg p-2.5 text-[11px] leading-relaxed ${
            isAI
              ? 'bg-[#161d30] border border-[#1e293b] text-slate-200'
              : 'bg-indigo-950/30 border border-indigo-900/30 text-slate-200'
          }`
          }
        >
          {textContent.trim() && (
            <div className="whitespace-pre-wrap text-slate-300 break-words select-text">{textContent.trim()}</div>
          )}

          {codeBlocks.map((block, index) => (
            <div key={index} className="mt-2 rounded-md overflow-hidden border border-[#1e293b]">
              <div className="flex items-center justify-between px-2.5 py-1 bg-[#0e121f] border-b border-[#1e293b]">
                <span className="text-[10px] text-slate-500 font-medium uppercase">{block.language}</span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleCopy(block.code, index)}
                    className="p-0.5 text-slate-500 hover:text-slate-300 transition"
                    title="Copy"
                  >
                    {copiedBlock === index ? (
                      <Check className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                  </button>
                  <button
                    onClick={() => handleApply(block.code, block.language)}
                    className="flex items-center gap-1 px-1.5 py-0.5 bg-violet-600/20 hover:bg-violet-600/30 text-violet-400 rounded text-[9px] transition"
                  >
                    <Wand2 className="w-2.5 h-2.5" />
                    Apply
                  </button>
                </div>
              </div>
              <pre className="p-2.5 bg-[#0b0f19] overflow-x-auto select-text">
                <code className="text-[10px] code-font text-slate-300">{block.code}</code>
              </pre>
            </div>
          ))}
        </div>

        <div className="mt-1 text-[9px] text-slate-600 px-1">
          {new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    </div>
  );
}

// src/components/AI/Message.tsx
import { useState, useCallback } from 'react';
import { User, Bot, Copy, Check, FileCode, FileType, Braces, Wand2 } from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import ReactMarkdown from 'react-markdown';
import { useWorkspaceStore } from '../../store/workspaceStore';

interface MessageProps {
  role: string;
  content: string;
  timestamp: number;
}

function getFileIcon(language: string) {
  switch (language) {
    case 'html': return <FileType className="w-3 h-3 text-orange-400" />;
    case 'css': return <FileType className="w-3 h-3 text-blue-400" />;
    case 'javascript': return <FileCode className="w-3 h-3 text-yellow-400" />;
    case 'typescript': return <Braces className="w-3 h-3 text-blue-500" />;
    default: return <FileCode className="w-3 h-3 text-[#8b949e]" />;
  }
}

function getLanguageColor(language: string): string {
  switch (language) {
    case 'html': return 'border-orange-500/30 bg-orange-500/10';
    case 'css': return 'border-blue-500/30 bg-blue-500/10';
    case 'javascript': return 'border-yellow-500/30 bg-yellow-500/10';
    case 'typescript': return 'border-blue-600/30 bg-blue-600/10';
    case 'json': return 'border-green-500/30 bg-green-500/10';
    case 'bash': return 'border-gray-500/30 bg-gray-500/10';
    default: return 'border-[#30363d] bg-[#161b22]';
  }
}

export default function Message({ role, content, timestamp }: MessageProps) {
  const [copiedBlock, setCopiedBlock] = useState<string | null>(null);
  const isUser = role === 'user';

  const handleCopy = useCallback((code: string, blockId: string) => {
    navigator.clipboard.writeText(code);
    setCopiedBlock(blockId);
    setTimeout(() => setCopiedBlock(null), 2000);
  }, []);

  const handleApply = useCallback((code: string, language: string) => {
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
  }, []);

  const timeStr = new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div className={`flex gap-2 ${isUser ? 'flex-row-reverse' : ''} animate-message`}>
      {/* Avatar */}
      <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 mt-0.5 ${
        isUser ? 'bg-[#1f6feb]' : 'bg-violet-600'
      }`}>
        {isUser ? <User className="w-2.5 h-2.5 text-white" /> : <Bot className="w-2.5 h-2.5 text-white" />}
      </div>

      {/* Message Content - FIXED WIDTH */}
      <div className={`${isUser ? 'text-right' : ''} min-w-0 max-w-[260px]`}>
        <div className={`inline-block rounded-lg px-2.5 py-1.5 w-full ${
          isUser 
            ? 'bg-[#1f6feb] text-white' 
            : 'bg-[#161b22] border border-[#21262d] text-[#c9d1d9]'
        }`}>
          {isUser ? (
            <p className="text-[11px] whitespace-pre-wrap break-words">{content}</p>
          ) : (
            <div className="max-w-none">
              <ReactMarkdown
                components={{
                  code({ node, inline, className, children, ...props }: any) {
                    const match = /language-(\w+)/.exec(className || '');
                    const language = match ? match[1] : 'text';
                    const codeString = String(children).replace(/\n$/, '');
                    const blockId = `code-${Math.random().toString(36).substr(2, 9)}`;

                    if (!inline && language !== 'text') {
                      return (
                        <div className={`rounded border overflow-hidden my-1.5 ${getLanguageColor(language)}`}>
                          {/* Code Block Header */}
                          <div className="flex items-center justify-between px-2 py-1 bg-black/20 border-b border-inherit">
                            <div className="flex items-center gap-1">
                              {getFileIcon(language)}
                              <span className="text-[9px] font-medium text-[#8b949e] uppercase">{language}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => handleCopy(codeString, blockId)}
                                className="flex items-center gap-0.5 px-1 py-0.5 rounded text-[9px] text-[#8b949e] hover:text-white hover:bg-white/10 transition-colors"
                              >
                                {copiedBlock === blockId ? (
                                  <><Check className="w-2 h-2 text-emerald-400" /> Copied</>
                                ) : (
                                  <><Copy className="w-2 h-2" /> Copy</>
                                )}
                              </button>
                              <button
                                onClick={() => handleApply(codeString, language)}
                                className="flex items-center gap-0.5 px-1 py-0.5 rounded text-[9px] bg-violet-600/20 hover:bg-violet-600/30 text-violet-400 transition-colors"
                              >
                                <Wand2 className="w-2 h-2" /> Apply
                              </button>
                            </div>
                          </div>
                          {/* Code Content */}
                          <SyntaxHighlighter
                            language={language}
                            style={vscDarkPlus}
                            customStyle={{
                              margin: 0,
                              padding: '8px',
                              background: 'transparent',
                              fontSize: '10px',
                              lineHeight: '1.4',
                            }}
                            showLineNumbers
                            lineNumberStyle={{
                              color: '#484f58',
                              paddingRight: '8px',
                              minWidth: '24px',
                              fontSize: '9px',
                            }}
                          >
                            {codeString}
                          </SyntaxHighlighter>
                        </div>
                      );
                    }

                    // Inline code or plain text blocks
                    return (
                      <code className="px-1 py-px rounded bg-[#0d1117] border border-[#30363d] text-[#ff7b72] text-[11px] font-mono" {...props}>
                        {children}
                      </code>
                    );
                  },
                  h1: ({ children }: any) => <h1 className="text-sm font-bold text-white mt-2 mb-1">{children}</h1>,
                  h2: ({ children }: any) => <h2 className="text-xs font-semibold text-[#58a6ff] mt-2 mb-1">{children}</h2>,
                  h3: ({ children }: any) => <h3 className="text-[11px] font-semibold text-[#7ee787] mt-1.5 mb-0.5">{children}</h3>,
                  p: ({ children }: any) => <p className="text-[11px] text-[#c9d1d9] leading-relaxed mb-1">{children}</p>,
                  ul: ({ children }: any) => <ul className="list-disc list-inside text-[11px] text-[#c9d1d9] space-y-px mb-1">{children}</ul>,
                  ol: ({ children }: any) => <ol className="list-decimal list-inside text-[11px] text-[#c9d1d9] space-y-px mb-1">{children}</ol>,
                  li: ({ children }: any) => <li className="text-[11px] text-[#c9d1d9]">{children}</li>,
                  blockquote: ({ children }: any) => (
                    <blockquote className="border-l border-[#58a6ff] pl-2 py-px my-1 bg-[#0d1117] rounded-r">
                      <p className="text-[11px] text-[#8b949e] italic">{children}</p>
                    </blockquote>
                  ),
                  a: ({ children, href }: any) => (
                    <a href={href} target="_blank" rel="noopener noreferrer" className="text-[#58a6ff] hover:underline text-[11px]">
                      {children}
                    </a>
                  ),
                  // BLOCK tables completely
                  table: () => null,
                  thead: () => null,
                  tbody: () => null,
                  tr: () => null,
                  td: () => null,
                  th: () => null,
                  hr: () => <hr className="border-[#30363d] my-2" />,
                  strong: ({ children }: any) => <strong className="text-[#f0883e] font-semibold">{children}</strong>,
                  em: ({ children }: any) => <em className="text-[#d2a8ff] italic">{children}</em>,
                }}
              >
                {content}
              </ReactMarkdown>
            </div>
          )}
        </div>
        <span className="text-[9px] text-[#484f58] mt-0.5 block">{timeStr}</span>
      </div>
    </div>
  );
}
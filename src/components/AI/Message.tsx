// src/components/AI/Message.tsx
import { useState, useCallback, memo } from 'react';
import { User, Bot, Copy, Check, FileCode, FileType, Braces, Wand2, Loader2, AlertTriangle } from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import ReactMarkdown from 'react-markdown';
import { useWorkspaceStore } from '../../store/workspaceStore';

// ─── TYPES ──────────────────────────────────────────────────────────

interface AppliedEdit {
  filename: string;
  type: string;
  changes?: number;
}

interface FailedEdit {
  filename: string;
  reason: string;
}

interface WireframeData {
  title: string;
  content: string;
}

interface MessageProps {
  role: string;
  content: string;
  timestamp: number;
  isStreaming?: boolean;
  edits?: AppliedEdit[];        // NEW: applied edits
  failedEdits?: FailedEdit[];   // NEW: failed edits
  wireframes?: WireframeData[]; // NEW: wireframes
}

interface CodeBlock {
  language: string;
  code: string;
  filename: string | null;
  isEdit: boolean;
}

// ─── HELPERS ────────────────────────────────────────────────────────

function getFileIcon(language: string) {
  switch (language) {
    case 'html': return <FileType className="w-3 h-3 text-orange-400" />;
    case 'css': return <FileType className="w-3 h-3 text-blue-400" />;
    case 'javascript': return <FileCode className="w-3 h-3 text-yellow-400" />;
    case 'typescript': return <Braces className="w-3 h-3 text-blue-500" />;
    default: return <FileCode className="w-3 h-3 text-[#8b949e]" />;
  }
}

function extractCodeBlocks(content: string): CodeBlock[] {
  const blocks: CodeBlock[] = [];
  
  const editRegex = /```edit:([^\n]+)\n([\s\S]*?)```/g;
  let match;
  while ((match = editRegex.exec(content)) !== null) {
    const filename = match[1].trim();
    const code = match[2].trim();
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    const language = ext === 'html' ? 'html' : ext === 'css' ? 'css' : ext === 'js' ? 'javascript' : ext === 'ts' ? 'typescript' : ext === 'tsx' ? 'typescript' : ext === 'jsx' ? 'javascript' : 'text';
    blocks.push({ language, code, filename, isEdit: true });
  }

  const codeRegex = /```(\w+)?\n([\s\S]*?)```/g;
  while ((match = codeRegex.exec(content)) !== null) {
    const language = match[1] || 'text';
    const code = match[2].trim();
    if (blocks.some(b => b.code === code && b.isEdit)) continue;
    let filename = null;
    if (language === 'html') filename = 'index.html';
    else if (language === 'css') filename = 'style.css';
    else if (language === 'javascript' || language === 'js') filename = 'script.js';
    else if (language === 'typescript' || language === 'ts') filename = 'app.ts';
    else if (language === 'json') filename = 'config.json';
    blocks.push({ language, code, filename, isEdit: false });
  }

  return blocks;
}

// ─── CODE BLOCK COMPONENT ──────────────────────────────────────────

const CodeBlockComponent = memo(function CodeBlockComponent({ 
  block, 
  onCopy, 
  onApply, 
  copiedBlock 
}: { 
  block: CodeBlock;
  onCopy: (code: string, id: string) => void;
  onApply: (code: string, filename: string | null) => void;
  copiedBlock: string | null;
}) {
  const blockId = `code-${block.code.slice(0, 20).replace(/\W/g, '')}-${Math.random().toString(36).substr(2, 5)}`;
  const displayFilename = block.isEdit ? block.filename : block.filename;
  const hasCode = block.code && block.code.length > 0;

  return (
    <div className="my-2 rounded-lg overflow-hidden border border-emerald-500/40 bg-emerald-500/5 shadow-sm">
      <div className="flex items-center justify-between px-3 py-1.5 bg-emerald-500/10 border-b border-emerald-500/20">
        <div className="flex items-center gap-2">
          {getFileIcon(block.language)}
          <span className="text-[10px] font-mono font-medium text-emerald-300 uppercase">{block.language}</span>
          {block.isEdit && displayFilename && (
            <span className="text-[9px] text-emerald-400 font-mono flex items-center gap-1">
              <Wand2 className="w-2.5 h-2.5" />
              {displayFilename}
            </span>
          )}
          {!block.isEdit && displayFilename && (
            <span className="text-[9px] text-emerald-400/60 font-mono">→ {displayFilename}</span>
          )}
          {!hasCode && (
            <span className="text-[9px] text-red-400 flex items-center gap-1">
              <AlertTriangle className="w-2.5 h-2.5" />
              Empty code
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onCopy(block.code, blockId)}
            className="flex items-center gap-1 px-2 py-0.5 rounded text-[9px] bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 transition-all"
            title="Copy code"
            disabled={!hasCode}
          >
            {copiedBlock === blockId ? (
              <><Check className="w-3 h-3 text-emerald-400" /> Copied</>
            ) : (
              <><Copy className="w-3 h-3" /> Copy</>
            )}
          </button>
          {block.isEdit && displayFilename && (
            <button
              onClick={() => {
                if (!hasCode) {
                  showToast('❌ Cannot apply: code block is empty.');
                  return;
                }
                onApply(block.code, displayFilename);
              }}
              className="flex items-center gap-1 px-2 py-0.5 rounded text-[9px] bg-violet-600/30 hover:bg-violet-600/40 text-violet-300 transition-all"
              title="Apply changes to file"
            >
              <Wand2 className="w-2.5 h-2.5" /> Apply
            </button>
          )}
        </div>
      </div>

      {hasCode ? (
        <SyntaxHighlighter
          language={block.language}
          style={vscDarkPlus}
          customStyle={{
            margin: 0,
            padding: '10px 12px',
            background: 'transparent',
            fontSize: '11px',
            lineHeight: '1.5',
            borderRadius: '0 0 8px 8px',
          }}
          showLineNumbers
          lineNumberStyle={{
            color: '#484f58',
            paddingRight: '12px',
            minWidth: '28px',
            fontSize: '10px',
            userSelect: 'none',
          }}
        >
          {block.code}
        </SyntaxHighlighter>
      ) : (
        <div className="px-3 py-2 text-[11px] text-red-400/70 bg-red-500/5 flex items-center gap-2">
          <AlertTriangle className="w-3 h-3" />
          <span>This code block is empty. The AI may not have generated the content.</span>
        </div>
      )}
    </div>
  );
});

// ─── STREAMING CURSOR ─────────────────────────────────────────────

const StreamingCursor = memo(function StreamingCursor() {
  return (
    <span className="inline-flex items-center ml-0.5">
      <span className="w-1.5 h-3.5 bg-emerald-400 animate-pulse inline-block" />
    </span>
  );
});

// ─── MAIN MESSAGE COMPONENT ──────────────────────────────────────

let showToastFn: ((message: string) => void) | null = null;
function showToast(message: string) {
  if (showToastFn) showToastFn(message);
}

export default function Message({ 
  role, 
  content, 
  timestamp, 
  isStreaming, 
  edits = [], 
  failedEdits = [], 
  wireframes = [] 
}: MessageProps) {
  const [copiedBlock, setCopiedBlock] = useState<string | null>(null);
  const isUser = role === 'user';
  const { updateFile } = useWorkspaceStore();

  const handleCopy = useCallback((code: string, blockId: string) => {
    navigator.clipboard.writeText(code);
    setCopiedBlock(blockId);
    setTimeout(() => setCopiedBlock(null), 2000);
  }, []);

  const handleApply = useCallback((code: string, filename: string | null) => {
    if (!filename) {
      showToast('❌ Cannot apply: no target file detected.');
      return;
    }
    if (!code || code.trim().length === 0) {
      showToast('❌ Cannot apply: code block is empty.');
      return;
    }
    updateFile(filename, code);
    showToast(`✅ Applied changes to ${filename}`);
  }, [updateFile]);

  // Set toast function
  showToastFn = useCallback((message: string) => {
    const toast = document.getElementById('toast');
    const toastMsg = document.getElementById('toastMsg');
    if (toast && toastMsg) {
      toastMsg.textContent = message;
      toast.classList.remove('opacity-0', 'pointer-events-none');
      toast.classList.add('opacity-100');
      setTimeout(() => {
        toast.classList.remove('opacity-100');
        toast.classList.add('opacity-0', 'pointer-events-none');
      }, 3000);
    }
  }, []);

  const timeStr = new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // Extract code blocks from content
  const codeBlocks = extractCodeBlocks(content);
  const codeToBlock = new Map<string, CodeBlock>();
  codeBlocks.forEach(block => {
    codeToBlock.set(block.code, block);
  });

  // ─── RENDER EDITS FROM METADATA ──────────────────────────────────
  const renderEdits = () => {
    if (!edits || edits.length === 0) return null;
    return edits.map((edit, idx) => {
      // We need to get the actual code from somewhere.
      // The backend sends the code in the edit object, but our interface only has filename and type.
      // Actually, the edit object from the backend might not contain the code.
      // Let's check the interface: `AppliedEdit` only has filename and type.
      // That means the code is not included in the metadata.
      // So we cannot render the code from the metadata.
      // We need the backend to include the code in the edit object, or we need to store the full edit.
      // Or, we can rely on the content extraction.
      // Since the content extraction is not working because the backend strips the code, we need to change the backend.
      // But we can also store the edit with the code in the metadata.
      
      // For now, we'll just show a placeholder.
      return (
        <div key={idx} className="text-[11px] text-emerald-300/80 flex items-center gap-2 my-1">
          <Check className="w-3 h-3 text-emerald-400" />
          <span>{edit.filename}</span>
          <span className="text-[9px] text-emerald-500/60">— {edit.type}</span>
        </div>
      );
    });
  };

  return (
    <div className={`flex gap-2 ${isUser ? 'flex-row-reverse' : ''} animate-message`}>
      <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 mt-0.5 ${
        isUser ? 'bg-[#1f6feb]' : 'bg-emerald-600'
      }`}>
        {isUser ? <User className="w-2.5 h-2.5 text-white" /> : <Bot className="w-2.5 h-2.5 text-white" />}
      </div>

      <div className={`${isUser ? 'text-right' : ''} min-w-0 max-w-[85%]`}>
        <div className={`inline-block rounded-lg px-4 py-3 w-full ${
          isUser 
            ? 'bg-indigo-600 text-white' 
            : 'bg-[#1a2035] text-slate-200 border border-[#1e293b]'
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
                    const blockInfo = codeToBlock.get(codeString);

                    if (!inline && language !== 'text') {
                      return (
                        <CodeBlockComponent
                          block={blockInfo || { language, code: codeString, filename: null, isEdit: false }}
                          onCopy={handleCopy}
                          onApply={handleApply}
                          copiedBlock={copiedBlock}
                        />
                      );
                    }

                    return (
                      <code className="px-1 py-px rounded bg-[#0d1117] border border-[#30363d] text-[#ff7b72] text-[11px] font-mono" {...props}>
                        {children}
                      </code>
                    );
                  },
                  h1: ({ children }: any) => <h1 className="text-sm font-bold text-white mt-2 mb-1">{children}</h1>,
                  h2: ({ children }: any) => <h2 className="text-xs font-semibold text-[#58a6ff] mt-2 mb-1">{children}</h2>,
                  h3: ({ children }: any) => <h3 className="text-[11px] font-semibold text-[#7ee787] mt-1.5 mb-0.5">{children}</h3>,
                  p: ({ children }: any) => (
                    <p className="text-[11px] text-[#c9d1d9] leading-relaxed mb-1">
                      {children}
                      {isStreaming && <StreamingCursor />}
                    </p>
                  ),
                  ul: ({ children }: any) => <ul className="list-disc list-inside text-[11px] text-[#c9d1d9] space-y-px mb-1">{children}</ul>,
                  ol: ({ children }: any) => <ol className="list-decimal list-inside text-[11px] text-[#c9d1d9] space-y-px mb-1">{children}</ol>,
                  li: ({ children }: any) => <li className="text-[11px] text-[#c9d1d9]">{children}</li>,
                  blockquote: ({ children }: any) => (
                    <blockquote className="border-l-2 border-[#58a6ff] pl-2 py-px my-1 bg-[#0d1117] rounded-r">
                      <p className="text-[11px] text-[#8b949e] italic">{children}</p>
                    </blockquote>
                  ),
                  a: ({ children, href }: any) => (
                    <a href={href} target="_blank" rel="noopener noreferrer" className="text-[#58a6ff] hover:underline text-[11px]">
                      {children}
                    </a>
                  ),
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
              
              {/* ─── Render edits from metadata ────────────────── */}
              {edits && edits.length > 0 && (
                <div className="mt-2 pt-2 border-t border-[#1e293b]/50">
                  <div className="text-[9px] text-emerald-400/70 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    Modified: {edits.map(e => e.filename).join(', ')}
                  </div>
                </div>
              )}
              
              {isStreaming && content.length > 0 && !content.endsWith('\n') && (
                <StreamingCursor />
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-[9px] text-[#484f58]">{timeStr}</span>
          {isStreaming && (
            <span className="flex items-center gap-1 text-[9px] text-emerald-400">
              <Loader2 className="w-2.5 h-2.5 animate-spin" />
              typing
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// Import missing icon
import { CheckCircle2 } from 'lucide-react';
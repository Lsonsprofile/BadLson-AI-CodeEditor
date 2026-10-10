// src/components/AI/ChatPanel.tsx
import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Send, Bot, User, Loader2, Sparkles, Copy, Check,
  ChevronDown, Code, Bug, Lightbulb, Wand2, Eye, Layout,
  Circle, Wrench,
} from 'lucide-react';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { useApiHealth } from '@/hooks/useApiHealth';
import { PROVIDER_CONFIG, type AiProviderKey } from '@/ai/providerConfig';
import { API_BASE_URL } from '@/services/api';

interface AppliedEdit {
  filename: string;
  type: string;
  changes?: number;
}

interface FailedEdit {
  filename: string;
  reason: string;
}

interface ChatResponse {
  success: boolean;
  response: string;
  provider: string;
  model: string;
  mode: string;
  edits: { applied: AppliedEdit[]; failed: FailedEdit[] };
  updatedFiles: Record<string, string>;
  timestamp: string;
  error?: string;
  rawContent?: string;
}

const AI_SUGGESTIONS = [
  { icon: Wand2, text: 'Improve the page design', color: 'text-violet-400' },
  { icon: Code, text: 'Create a new HTML page', color: 'text-sky-400' },
  { icon: Bug, text: 'Find and fix bugs', color: 'text-rose-400' },
  { icon: Lightbulb, text: 'Add a dark mode toggle', color: 'text-amber-400' },
  { icon: Layout, text: 'Wireframe a dashboard', color: 'text-emerald-400' },
  { icon: Eye, text: 'Explain this project', color: 'text-cyan-400' },
];

/** Guess a target file path from fence language / code content / active file */
function guessFilePath(
  tag: string,
  code: string,
  activeFile: string | null
): string | null {
  const t = (tag || '').trim();
  if (t.startsWith('edit:') || t.startsWith('patch:')) {
    const path = t.replace(/^(edit|patch):/, '').trim();
    return path || null;
  }
  if (t.includes('/') || /\.\w{1,8}$/.test(t)) {
    return t;
  }
  const lang = t.toLowerCase();
  if (lang === 'html' || code.includes('<!DOCTYPE') || /<html[\s>]/i.test(code)) {
    return activeFile?.endsWith('.html') || activeFile?.endsWith('.htm')
      ? activeFile
      : 'index.html';
  }
  if (lang === 'css') {
    return activeFile?.endsWith('.css') ? activeFile : 'style.css';
  }
  if (lang === 'js' || lang === 'javascript') {
    return activeFile?.endsWith('.js') ? activeFile : 'script.js';
  }
  if (lang === 'ts' || lang === 'typescript') {
    return activeFile?.endsWith('.ts') ? activeFile : 'main.ts';
  }
  if (lang === 'tsx' || lang === 'jsx') {
    return activeFile || 'App.tsx';
  }
  if (lang === 'json') {
    return activeFile?.endsWith('.json') ? activeFile : 'data.json';
  }
  if (activeFile && code.trim().length > 20) return activeFile;
  return null;
}

function CodeBlock({
  code,
  language,
  filePath,
  onApply,
}: {
  code: string;
  language?: string;
  filePath?: string | null;
  onApply?: (path: string, content: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [applied, setApplied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* ignore */
    }
  };

  const handleApply = () => {
    if (!filePath || !onApply) return;
    onApply(filePath, code);
    setApplied(true);
    setTimeout(() => setApplied(false), 2000);
  };

  const label = filePath || language || 'code';

  return (
    <div className="my-2 rounded-xl overflow-hidden border border-white/10 bg-[#0c0f14]">
      <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-white/5 border-b border-white/5">
        <span className="text-[10px] font-medium text-slate-400 tracking-wide truncate" title={label}>
          {label}
        </span>
        <div className="flex items-center gap-1.5 shrink-0">
          {filePath && onApply && (
            <button
              type="button"
              onClick={handleApply}
              className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium transition ${
                applied
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'bg-indigo-500/20 text-indigo-200 border border-indigo-500/30 hover:bg-indigo-500/30'
              }`}
              title={`Apply this code to ${filePath}`}
            >
              {applied ? (
                <>
                  <Check className="w-3 h-3" /> Applied
                </>
              ) : (
                <>
                  <Wrench className="w-3 h-3" /> Apply
                </>
              )}
            </button>
          )}
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-white transition px-1.5 py-0.5"
          >
            {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>
      <pre className="p-3 overflow-x-auto text-[11px] font-mono text-slate-300 leading-relaxed max-h-80">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function MessageContent({
  content,
  activeFile,
  onApply,
}: {
  content: string;
  activeFile: string | null;
  onApply: (path: string, content: string) => void;
}) {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  const codeBlockRegex = /```([^\n`]*)\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  const pendingApplies: { path: string; code: string }[] = [];

  while ((match = codeBlockRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push(
        <div
          key={`t-${lastIndex}`}
          className="text-[13px] leading-relaxed text-slate-200 whitespace-pre-wrap"
        >
          {content.slice(lastIndex, match.index)}
        </div>
      );
    }
    const tag = (match[1] || '').trim();
    const code = match[2].trim();
    if (!tag.startsWith('wireframe:')) {
      const filePath = guessFilePath(tag, code, activeFile);
      if (filePath) pendingApplies.push({ path: filePath, code });
      const langLabel =
        tag.startsWith('edit:') || tag.startsWith('patch:')
          ? tag.replace(/^(edit|patch):/, '')
          : tag || (filePath ?? 'code');
      parts.push(
        <CodeBlock
          key={`c-${match.index}`}
          code={code}
          language={langLabel}
          filePath={filePath}
          onApply={onApply}
        />
      );
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    parts.push(
      <div
        key={`t-${lastIndex}`}
        className="text-[13px] leading-relaxed text-slate-200 whitespace-pre-wrap"
      >
        {content.slice(lastIndex)}
      </div>
    );
  }

  const uniquePaths = Array.from(new Map(pendingApplies.map((p) => [p.path, p])).values());

  return (
    <div className="space-y-1">
      {parts}
      {uniquePaths.length > 1 && (
        <div className="pt-1">
          <button
            type="button"
            onClick={() => {
              for (const item of uniquePaths) onApply(item.path, item.code);
            }}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-indigo-600/30 text-indigo-100 border border-indigo-500/40 hover:bg-indigo-600/45 transition"
          >
            <Wrench className="w-3.5 h-3.5" />
            Apply all ({uniquePaths.length} files)
          </button>
        </div>
      )}
    </div>
  );
}

export default function ChatPanel() {
  const {
    chatHistory,
    isAiTyping,
    addChatMessage,
    setIsAiTyping,
    aiProvider,
    setAiProvider,
    files,
    folders,
    activeFile,
    openFiles,
    updateFile,
    openFile,
  } = useWorkspaceStore();

  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { status: apiStatus } = useApiHealth({ pollingInterval: 15000 });
  const online = apiStatus === 'online';

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, isAiTyping]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const buildProjectFiles = useCallback((): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const [path, content] of Object.entries(files)) {
      if (content && typeof content === 'string' && content.trim() && content !== '__BINARY__') {
        out[path] = content;
      }
    }
    return out;
  }, [files]);

  /** Manual apply only — never called automatically after AI response */
  const applyOneFile = useCallback(
    (path: string, content: string) => {
      if (!path || typeof content !== 'string') return;
      updateFile(path, content);
      openFile(path);
      setToast(`Applied to ${path}`);
      window.setTimeout(() => setToast(null), 2200);
    },
    [updateFile, openFile]
  );

  const handleSend = async (overrideText?: string) => {
    const userMessage = (overrideText ?? input).trim();
    if (!userMessage || isLoading || isAiTyping) return;

    setInput('');
    setIsLoading(true);
    addChatMessage('user', userMessage);

    try {
      setIsAiTyping(true);
      const projectFiles = buildProjectFiles();

      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 60000);

      let response: Response;
      try {
        response = await fetch(`${API_BASE_URL}/ai/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            message: userMessage,
            projectFiles,
            folders: folders || [],
            chatHistory: chatHistory.slice(-10).map((msg) => ({
              role: msg.role,
              content: msg.content,
            })),
            provider: aiProvider.provider || 'openrouter',
            activeFile: activeFile || null,
            recentFiles: openFiles.slice(-5),
            consoleErrors: [],
            buildErrors: [],
            selectedCode: null,
            cursorPosition: null,
          }),
        });
      } finally {
        window.clearTimeout(timeoutId);
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `HTTP ${response.status}`);
      }

      const backendResponse = (await response.json()) as
        | ChatResponse
        | { success: boolean; data: ChatResponse };
      const data = ((backendResponse as { data?: ChatResponse }).data ??
        backendResponse) as ChatResponse;

      if (!data.success) throw new Error(data.error || 'AI request failed');

      // Never auto-apply. User must click Apply / Apply all on code blocks.
      const aiText = data.rawContent || data.response || '';
      if (!aiText) throw new Error('No response from AI');

      addChatMessage('assistant', aiText);
    } catch (error) {
      let msg = error instanceof Error ? error.message : 'Unknown error';
      if (
        msg === 'Failed to fetch' ||
        msg.includes('NetworkError') ||
        msg.includes('Load failed') ||
        msg.includes('Network request failed')
      ) {
        msg =
          'Cannot reach the AI server.\n\n' +
          '**Fix:**\n' +
          '1. Open a terminal in the project folder\n' +
          '2. Run: `npm run server:dev`\n' +
          '3. Wait until you see "Server running on port 5002"\n' +
          '4. Keep that terminal open, then try again\n\n' +
          'If you use the online site, the free backend may be sleeping — wait ~30 seconds and retry.';
      } else if (msg.includes('abort') || msg.includes('AbortError')) {
        msg =
          'Request timed out. The server may be slow or offline. Check that the backend is running (`npm run server:dev`).';
      }
      addChatMessage('assistant', msg);
    } finally {
      setIsAiTyping(false);
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleCopy = async (text: string, idx: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 1500);
    } catch {
      /* ignore */
    }
  };

  const providers = Object.entries(PROVIDER_CONFIG || {}) as [
    AiProviderKey,
    { label?: string; name?: string }
  ][];

  return (
    <div className="h-full w-full flex flex-col bg-[#0a0c10] text-slate-100 relative">
      {toast && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 px-3 py-1.5 rounded-lg bg-emerald-600/90 text-[11px] text-white shadow-lg">
          {toast}
        </div>
      )}

      <div className="shrink-0 px-4 py-3 border-b border-white/5 flex items-center justify-between bg-[#0d1017]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="text-sm font-semibold tracking-tight">AI Assistant</div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <Circle
                className={`w-2 h-2 fill-current ${online ? 'text-emerald-400' : 'text-rose-400'}`}
              />
              <span className="text-[10px] text-slate-500">
                {online ? 'Connected' : 'Offline — start backend'}
              </span>
            </div>
          </div>
        </div>

        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setIsDropdownOpen((v) => !v)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] text-slate-300 transition"
          >
            <span className="capitalize">{aiProvider?.provider || 'openrouter'}</span>
            <ChevronDown className="w-3 h-3 opacity-60" />
          </button>
          {isDropdownOpen && (
            <div className="absolute right-0 mt-1 w-40 rounded-xl border border-white/10 bg-[#12151c] shadow-xl z-20 overflow-hidden">
              {providers.length > 0
                ? providers.map(([key, cfg]) => (
                    <button
                      key={key}
                      onClick={() => {
                        setAiProvider({ ...aiProvider, provider: key });
                        setIsDropdownOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 text-[11px] hover:bg-white/5 transition ${
                        aiProvider?.provider === key ? 'text-indigo-300' : 'text-slate-300'
                      }`}
                    >
                      {cfg.label || cfg.name || key}
                    </button>
                  ))
                : (['openrouter', 'groq', 'gemini'] as AiProviderKey[]).map((key) => (
                    <button
                      key={key}
                      onClick={() => {
                        setAiProvider({ ...aiProvider, provider: key });
                        setIsDropdownOpen(false);
                      }}
                      className="w-full text-left px-3 py-2 text-[11px] text-slate-300 hover:bg-white/5 capitalize"
                    >
                      {key}
                    </button>
                  ))}
            </div>
          )}
        </div>
      </div>

      {!online && (
        <div className="px-3 py-2 bg-rose-500/10 border-b border-rose-500/20 text-[11px] text-rose-200">
          Backend offline. Run <code className="text-rose-100">npm run server:dev</code> in a
          terminal, then retry.
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-4">
        {chatHistory.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center px-4 text-center">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-violet-600/20 border border-white/10 flex items-center justify-center mb-4">
              <Bot className="w-7 h-7 text-indigo-300" />
            </div>
            <h3 className="text-base font-semibold text-white mb-1">How can I help?</h3>
            <p className="text-[12px] text-slate-500 mb-2 max-w-[280px]">
              AI suggestions appear as code blocks. Click{' '}
              <span className="text-indigo-300">Apply</span> to write them into your project —
              nothing is applied automatically.
            </p>
            <div className="flex flex-wrap gap-2 justify-center max-w-[300px] mt-4">
              {AI_SUGGESTIONS.map((s) => (
                <button
                  key={s.text}
                  onClick={() => handleSend(s.text)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 hover:border-indigo-400/40 hover:bg-indigo-500/10 transition text-[11px] text-slate-300"
                >
                  <s.icon className={`w-3 h-3 ${s.color}`} />
                  {s.text}
                </button>
              ))}
            </div>
          </div>
        ) : (
          chatHistory.map((msg, index) => {
            const isUser = msg.role === 'user';
            return (
              <div
                key={index}
                className={`flex gap-2.5 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
              >
                <div
                  className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center ${
                    isUser
                      ? 'bg-indigo-600'
                      : 'bg-gradient-to-br from-violet-600 to-indigo-600'
                  }`}
                >
                  {isUser ? (
                    <User className="w-3.5 h-3.5 text-white" />
                  ) : (
                    <Bot className="w-3.5 h-3.5 text-white" />
                  )}
                </div>
                <div
                  className={`group relative max-w-[85%] rounded-2xl px-3.5 py-2.5 ${
                    isUser
                      ? 'bg-indigo-600 text-white rounded-tr-sm'
                      : 'bg-[#141820] border border-white/5 text-slate-200 rounded-tl-sm'
                  }`}
                >
                  {!isUser && (
                    <button
                      onClick={() => handleCopy(msg.content, index)}
                      className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition p-1 rounded bg-black/30 hover:bg-black/50"
                      title="Copy"
                    >
                      {copiedIdx === index ? (
                        <Check className="w-3 h-3 text-emerald-400" />
                      ) : (
                        <Copy className="w-3 h-3 text-slate-400" />
                      )}
                    </button>
                  )}
                  {isUser ? (
                    <p className="text-[13px] leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                  ) : (
                    <MessageContent
                      content={msg.content}
                      activeFile={activeFile || null}
                      onApply={applyOneFile}
                    />
                  )}
                </div>
              </div>
            );
          })
        )}

        {isAiTyping && (
          <div className="flex gap-2.5">
            <div className="shrink-0 w-7 h-7 rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center">
              <Bot className="w-3.5 h-3.5 text-white" />
            </div>
            <div className="bg-[#141820] border border-white/5 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 text-indigo-400 animate-spin" />
              <span className="text-[12px] text-slate-400">Thinking…</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="shrink-0 p-3 border-t border-white/5 bg-[#0d1017]">
        <div className="flex items-end gap-2 rounded-2xl bg-[#141820] border border-white/10 focus-within:border-indigo-500/40 transition px-3 py-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask the AI to write or fix code…"
            rows={1}
            disabled={isLoading || isAiTyping}
            className="flex-1 bg-transparent text-[13px] text-slate-100 placeholder:text-slate-500 resize-none outline-none max-h-28 min-h-[24px] py-1"
            style={{ height: 'auto' }}
            onInput={(e) => {
              const t = e.currentTarget;
              t.style.height = 'auto';
              t.style.height = `${Math.min(t.scrollHeight, 112)}px`;
            }}
          />
          <button
            onClick={() => handleSend()}
            disabled={!input.trim() || isLoading || isAiTyping}
            className="shrink-0 w-8 h-8 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:hover:bg-indigo-600 flex items-center justify-center transition shadow-lg shadow-indigo-600/20"
          >
            {isLoading || isAiTyping ? (
              <Loader2 className="w-4 h-4 text-white animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5 text-white" />
            )}
          </button>
        </div>
        <p className="text-[10px] text-slate-600 text-center mt-1.5">
          Enter to send · Code is applied only when you click Apply
        </p>
      </div>
    </div>
  );
}

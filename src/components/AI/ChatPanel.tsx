// src/components/AI/ChatPanel.tsx
import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Send, Bot, User, Loader2, Sparkles, Copy, Check,
  ChevronDown, Code, Bug, Lightbulb, Wand2, Eye, Layout,
  Circle,
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

interface WireframeData {
  title: string;
  content: string;
}

interface FileContextInfo {
  analyzed: boolean;
  fileCount: number;
  htmlAnalyzed: boolean;
}

interface ChatResponse {
  success: boolean;
  response: string;
  provider: string;
  model: string;
  mode: string;
  edits: { applied: AppliedEdit[]; failed: FailedEdit[] };
  updatedFiles: Record<string, string>;
  wireframes?: WireframeData[];
  fileContext?: FileContextInfo;
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

function CodeBlock({ code, language }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* ignore */
    }
  };
  return (
    <div className="my-2 rounded-xl overflow-hidden border border-white/10 bg-[#0c0f14]">
      <div className="flex items-center justify-between px-3 py-1.5 bg-white/5 border-b border-white/5">
        <span className="text-[10px] font-medium text-slate-400 tracking-wide uppercase">
          {language || 'code'}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-white transition"
        >
          {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="p-3 overflow-x-auto text-[11px] font-mono text-slate-300 leading-relaxed max-h-80">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function MessageContent({ content }: { content: string }) {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  const codeBlockRegex = /```([^\n`]*)\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      const text = content.slice(lastIndex, match.index);
      parts.push(
        <div
          key={`t-${lastIndex}`}
          className="text-[13px] leading-relaxed text-slate-200 whitespace-pre-wrap"
        >
          {text}
        </div>
      );
    }
    const tag = (match[1] || '').trim();
    const code = match[2].trim();
    if (!tag.startsWith('wireframe:')) {
      const label =
        tag.startsWith('edit:') || tag.startsWith('patch:')
          ? tag.replace(/^(edit|patch):/, '')
          : tag || 'code';
      parts.push(<CodeBlock key={`c-${match.index}`} code={code} language={label} />);
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

  return <div className="space-y-1">{parts}</div>;
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
    activeFile,
    openFiles,
    updateFile,
    openFile,
  } = useWorkspaceStore();

  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { status: apiStatus } = useApiHealth({ pollingInterval: 30000 });

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

  const applyFileUpdates = useCallback(
    (updatedFiles: Record<string, string>) => {
      for (const [path, content] of Object.entries(updatedFiles)) {
        if (typeof content !== 'string' || !path) continue;
        updateFile(path, content);
        openFile(path);
      }
    },
    [updateFile, openFile]
  );

  const extractFilesFromAiText = useCallback(
    (text: string): Record<string, string> => {
      const out: Record<string, string> = {};
      if (!text) return out;
      const editRe = /```edit:([^\n]+)\n([\s\S]*?)```/g;
      let m: RegExpExecArray | null;
      while ((m = editRe.exec(text)) !== null) {
        const name = m[1].trim();
        const code = m[2].trim();
        if (name && code) out[name] = code;
      }
      if (Object.keys(out).length === 0) {
        const fenceRe = /```(html|css|js|javascript|ts|tsx|jsx)?\n([\s\S]*?)```/gi;
        while ((m = fenceRe.exec(text)) !== null) {
          const lang = (m[1] || '').toLowerCase();
          const code = m[2].trim();
          if (!code || code.length < 8) continue;
          let filename: string | null = null;
          if (lang === 'html' || code.includes('<!DOCTYPE') || code.includes('<html')) {
            filename = activeFile?.endsWith('.html') ? activeFile : 'index.html';
          } else if (lang === 'css') {
            filename = activeFile?.endsWith('.css') ? activeFile : 'style.css';
          } else if (lang === 'js' || lang === 'javascript') {
            filename = activeFile?.endsWith('.js') ? activeFile : 'script.js';
          } else if (activeFile) {
            filename = activeFile;
          }
          if (filename && !out[filename]) out[filename] = code;
        }
      }
      return out;
    },
    [activeFile]
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

      const response = await fetch(`${API_BASE_URL}/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          projectFiles,
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

      if (data.updatedFiles && Object.keys(data.updatedFiles).length > 0) {
        applyFileUpdates(data.updatedFiles);
      } else {
        const aiText = data.rawContent || data.response || '';
        const extracted = extractFilesFromAiText(aiText);
        if (Object.keys(extracted).length > 0) applyFileUpdates(extracted);
      }

      const message = data.rawContent || data.response || '';
      if (!message) throw new Error('No response from AI');

      addChatMessage('assistant', message);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      addChatMessage('assistant', `Something went wrong: ${msg}`);
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

  // ApiHealthStatus is only: 'online' | 'offline' | 'unknown'
  const online = apiStatus === 'online';

  const providers = Object.entries(PROVIDER_CONFIG || {}) as [
    AiProviderKey,
    { label?: string; name?: string }
  ][];

  return (
    <div className="h-full w-full flex flex-col bg-[#0a0c10] text-slate-100">
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
                {online ? 'Connected' : 'Offline'}
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

      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-4">
        {chatHistory.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center px-4 text-center">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-violet-600/20 border border-white/10 flex items-center justify-center mb-4">
              <Bot className="w-7 h-7 text-indigo-300" />
            </div>
            <h3 className="text-base font-semibold text-white mb-1">How can I help?</h3>
            <p className="text-[12px] text-slate-500 mb-6 max-w-[240px]">
              Ask me to write code, fix bugs, or create pages for your project.
            </p>
            <div className="flex flex-wrap gap-2 justify-center max-w-[300px]">
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
                    <MessageContent content={msg.content} />
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
            placeholder="Ask AI to write or fix code…"
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
          Enter to send · Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}

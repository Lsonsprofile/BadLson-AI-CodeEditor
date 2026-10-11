// src/components/AI/ChatPanel.tsx
import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Send, Bot, User, Loader2,
  ChevronDown, Code, Bug, Lightbulb, Wand2, Eye, Layout,
  Circle, Trash2,
} from 'lucide-react';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { API_BASE_URL } from '@/services/api';
import { useApiHealth } from '@/hooks/useApiHealth';
import MarkdownContent from './MarkdownContent';

interface ChatResponse {
  success: boolean;
  response?: string;
  rawContent?: string;
  error?: string;
  files?: Array<{ path: string; content: string }>;
}

const SUGGESTIONS = [
  { icon: Wand2, label: 'Improve design', prompt: 'Improve the visual design of the current page while keeping structure.' },
  { icon: Code, label: 'New HTML page', prompt: 'Create a new HTML page with clean structure and linked CSS.' },
  { icon: Bug, label: 'Find bugs', prompt: 'Review the project for bugs and suggest precise fixes.' },
  { icon: Lightbulb, label: 'Dark mode', prompt: 'Add a dark mode toggle to this project.' },
  { icon: Layout, label: 'Dashboard', prompt: 'Create a simple dashboard layout with sidebar and cards.' },
  { icon: Eye, label: 'Explain project', prompt: 'Explain how this project is structured and what each file does.' },
];

export default function ChatPanel() {
  const {
    chatHistory, isAiTyping, addChatMessage, setIsAiTyping, clearChat,
    files, folders, activeFile, openFiles, updateFile, openFile, aiProvider,
  } = useWorkspaceStore();

  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [providerOpen, setProviderOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { status } = useApiHealth({ pollingInterval: 30000 });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, isAiTyping]);

  const buildProjectFiles = useCallback(() => {
    const out: Record<string, string> = {};
    for (const [path, content] of Object.entries(files || {})) {
      if (typeof content === 'string' && content.length < 80000) out[path] = content;
    }
    return out;
  }, [files]);

  const applyOneFile = useCallback((path: string, content: string) => {
    updateFile(path, content);
    openFile(path);
    setToast(`Applied ${path}`);
    window.setTimeout(() => setToast(null), 2200);
  }, [updateFile, openFile]);

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
            chatHistory: chatHistory.slice(-10).map((msg) => ({ role: msg.role, content: msg.content })),
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
      if (!response.ok) throw new Error((await response.text()) || `HTTP ${response.status}`);
      const backendResponse = (await response.json()) as ChatResponse | { success: boolean; data: ChatResponse };
      const data = ((backendResponse as { data?: ChatResponse }).data ?? backendResponse) as ChatResponse;
      if (!data.success) throw new Error(data.error || 'AI request failed');
      const aiText = data.rawContent || data.response || '';
      if (!aiText) throw new Error('No response from AI');
      addChatMessage('assistant', aiText);
    } catch (error) {
      let msg = error instanceof Error ? error.message : 'Unknown error';
      if (msg === 'Failed to fetch' || msg.includes('NetworkError') || msg.includes('Load failed')) {
        msg = 'Cannot reach the AI server. Check that the backend is online, then retry.';
      } else if (msg.includes('abort') || msg.includes('AbortError')) {
        msg = 'Request timed out. Check that the backend is running.';
      }
      addChatMessage('assistant', msg);
    } finally {
      setIsAiTyping(false);
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const online = status === 'online';

  return (
    <div className="h-full flex flex-col bg-[#0d1117] text-[#c9d1d9] border-l border-[#30363d]">
      <div className="shrink-0 h-10 px-3 flex items-center justify-between border-b border-[#30363d] bg-[#161b22]">
        <div className="flex items-center gap-2 min-w-0">
          <Bot className="w-4 h-4 text-[#8b949e] shrink-0" />
          <span className="text-[12px] font-medium text-[#c9d1d9] truncate">AI Assistant</span>
          <span className="inline-flex items-center gap-1 text-[10px] text-[#8b949e]">
            <Circle className={`w-1.5 h-1.5 fill-current ${online ? 'text-[#3fb950]' : 'text-[#f85149]'}`} />
            {online ? 'Connected' : 'Offline'}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              if (window.confirm('Clear chat history?')) clearChat();
            }}
            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] text-[#8b949e] hover:text-[#c9d1d9] hover:bg-[#21262d] rounded transition"
            title="Clear chat history"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear
          </button>
          <div className="relative">
            <button
              type="button"
              onClick={() => setProviderOpen((v) => !v)}
              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] text-[#8b949e] hover:text-[#c9d1d9] hover:bg-[#21262d] rounded transition"
            >
              {(aiProvider.provider || 'openrouter').toString()}
              <ChevronDown className="w-3 h-3" />
            </button>
            {providerOpen && (
              <div className="absolute right-0 top-full mt-1 z-20 w-36 bg-[#161b22] border border-[#30363d] rounded shadow-xl py-1">
                {['openrouter', 'groq', 'gemini'].map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => {
                      useWorkspaceStore.getState().setAiProvider({ provider: p as 'openrouter' | 'groq' | 'gemini' });
                      setProviderOpen(false);
                    }}
                    className="w-full text-left px-3 py-1.5 text-[11px] text-[#c9d1d9] hover:bg-[#21262d] capitalize"
                  >
                    {p}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {chatHistory.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center px-2 text-center">
            <div className="w-10 h-10 rounded border border-[#30363d] bg-[#161b22] flex items-center justify-center mb-3">
              <Bot className="w-5 h-5 text-[#8b949e]" />
            </div>
            <p className="text-[13px] font-medium text-[#c9d1d9] mb-1">How can I help?</p>
            <p className="text-[11px] text-[#8b949e] mb-4 max-w-[240px]">
              Ask for code, fixes, or explanations. Use Apply on code blocks to write files.
            </p>
            <div className="w-full space-y-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => void handleSend(s.prompt)}
                  className="w-full flex items-center gap-2 px-2.5 py-2 text-left text-[12px] text-[#c9d1d9] bg-[#161b22] border border-[#30363d] rounded hover:border-[#58a6ff]/50 hover:bg-[#1c2128] transition"
                >
                  <s.icon className="w-3.5 h-3.5 text-[#8b949e] shrink-0" />
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          chatHistory.map((msg, i) => {
            const isUser = msg.role === 'user';
            return (
              <div key={`${msg.timestamp}-${i}`} className={`flex gap-2 ${isUser ? 'flex-row-reverse' : ''}`}>
                <div
                  className={`shrink-0 w-6 h-6 rounded flex items-center justify-center border border-[#30363d] ${
                    isUser ? 'bg-[#1f6feb]/15' : 'bg-[#161b22]'
                  }`}
                >
                  {isUser ? (
                    <User className="w-3 h-3 text-[#58a6ff]" />
                  ) : (
                    <Bot className="w-3 h-3 text-[#8b949e]" />
                  )}
                </div>
                <div
                  className={`min-w-0 max-w-[92%] rounded px-3 py-2 border ${
                    isUser
                      ? 'bg-[#1f6feb]/15 border-[#1f6feb]/25'
                      : 'bg-[#161b22] border-[#30363d]'
                  }`}
                >
                  {isUser ? (
                    <p className="text-[13px] leading-relaxed whitespace-pre-wrap text-[#c9d1d9]">{msg.content}</p>
                  ) : (
                    <MarkdownContent content={msg.content} activeFile={activeFile || null} onApply={applyOneFile} />
                  )}
                </div>
              </div>
            );
          })
        )}
        {isAiTyping && (
          <div className="flex gap-2">
            <div className="shrink-0 w-6 h-6 rounded border border-[#30363d] bg-[#161b22] flex items-center justify-center">
              <Bot className="w-3 h-3 text-[#8b949e]" />
            </div>
            <div className="bg-[#161b22] border border-[#30363d] rounded px-3 py-2 flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 text-[#8b949e] animate-spin" />
              <span className="text-[12px] text-[#8b949e]">Thinking…</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {toast && (
        <div className="mx-3 mb-1 px-2.5 py-1.5 text-[11px] text-[#3fb950] bg-[#238636]/15 border border-[#238636]/30 rounded">
          {toast}
        </div>
      )}

      <div className="shrink-0 p-2.5 border-t border-[#30363d] bg-[#161b22]">
        <div className="flex items-end gap-2 rounded border border-[#30363d] bg-[#0d1117] focus-within:border-[#58a6ff]/50 transition px-2.5 py-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask for code or fixes…"
            rows={1}
            disabled={isLoading || isAiTyping}
            className="flex-1 bg-transparent text-[13px] text-[#c9d1d9] placeholder:text-[#484f58] resize-none outline-none max-h-28 min-h-[22px] py-0.5"
            style={{ height: 'auto' }}
            onInput={(e) => {
              const t = e.currentTarget;
              t.style.height = 'auto';
              t.style.height = `${Math.min(t.scrollHeight, 112)}px`;
            }}
          />
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={!input.trim() || isLoading || isAiTyping}
            className="shrink-0 w-7 h-7 rounded border border-[#30363d] bg-[#21262d] hover:bg-[#30363d] disabled:opacity-40 flex items-center justify-center transition"
          >
            {isLoading || isAiTyping ? (
              <Loader2 className="w-3.5 h-3.5 text-[#8b949e] animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5 text-[#c9d1d9]" />
            )}
          </button>
        </div>
        <p className="text-[10px] text-[#484f58] text-center mt-1.5">
          Enter to send · Apply writes code · Clear wipes history
        </p>
      </div>
    </div>
  );
}

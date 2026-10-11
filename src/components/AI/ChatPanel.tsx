// src/components/AI/ChatPanel.tsx
import { useState, useRef, useEffect, useCallback, memo } from 'react';
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

// Isolated input: typing only re-renders this small component
const ChatInputBar = memo(function ChatInputBar({
  disabled,
  onSend,
}: {
  disabled: boolean;
  onSend: (text: string) => void;
}) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const submit = useCallback(() => {
    const text = value.trim();
    if (!text || disabled) return;
    setValue('');
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }
    onSend(text);
  }, [value, disabled, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        submit();
      }
    },
    [submit]
  );

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
  }, []);

  const handleInput = useCallback((e: React.FormEvent<HTMLTextAreaElement>) => {
    const t = e.currentTarget;
    t.style.height = 'auto';
    t.style.height = `${Math.min(t.scrollHeight, 112)}px`;
  }, []);

  return (
    <div className="shrink-0 p-2.5 border-t border-[#30363d] bg-[#161b22]">
      <div className="flex items-end gap-2 rounded border border-[#30363d] bg-[#0d1117] focus-within:border-[#58a6ff]/50 transition px-2.5 py-2">
        <textarea
          ref={inputRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          placeholder="Ask for code or fixes…"
          rows={1}
          disabled={disabled}
          className="flex-1 bg-transparent text-[13px] text-[#c9d1d9] placeholder:text-[#484f58] resize-none outline-none max-h-28 min-h-[22px] py-0.5"
          style={{ height: 'auto' }}
        />
        <button
          type="button"
          onClick={submit}
          disabled={!value.trim() || disabled}
          className="shrink-0 w-7 h-7 rounded border border-[#30363d] bg-[#21262d] hover:bg-[#30363d] disabled:opacity-40 flex items-center justify-center transition"
        >
          {disabled ? (
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
  );
});

// Memoized messages: input typing must not re-render Markdown
const MessageList = memo(function MessageList({
  chatHistory,
  isAiTyping,
  activeFile,
  onApply,
}: {
  chatHistory: Array<{ role: string; content: string; timestamp: number }>;
  isAiTyping: boolean;
  activeFile: string;
  onApply: (path: string, content: string) => void;
}) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory.length, isAiTyping]);

  return (
    <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
      {chatHistory.length === 0 ? (
        <div className="space-y-3 pt-2">
          <p className="text-[12px] text-[#8b949e] text-center">
            Ask anything about your project. Code is only written when you click Apply.
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            {SUGGESTIONS.map((s) => (
              <button
                key={s.label}
                type="button"
                onClick={() => {
                  window.dispatchEvent(
                    new CustomEvent('chat-suggestion', { detail: s.prompt })
                  );
                }}
                className="flex items-center gap-1.5 px-2 py-1.5 rounded border border-[#30363d] bg-[#161b22] hover:bg-[#21262d] text-left transition"
              >
                <s.icon className="w-3 h-3 text-[#8b949e] shrink-0" />
                <span className="text-[11px] text-[#c9d1d9] truncate">{s.label}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        chatHistory.map((msg, i) => {
          const isUser = msg.role === 'user';
          return (
            <div key={`${msg.timestamp}-${i}`} className="flex gap-2">
              <div
                className={`shrink-0 w-6 h-6 rounded border flex items-center justify-center ${
                  isUser
                    ? 'border-[#30363d] bg-[#21262d]'
                    : 'border-[#30363d] bg-[#161b22]'
                }`}
              >
                {isUser ? (
                  <User className="w-3 h-3 text-[#8b949e]" />
                ) : (
                  <Bot className="w-3 h-3 text-[#8b949e]" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                {isUser ? (
                  <div className="text-[13px] text-[#c9d1d9] whitespace-pre-wrap break-words">
                    {msg.content}
                  </div>
                ) : (
                  <MarkdownContent
                    content={msg.content}
                    activeFile={activeFile || null}
                    onApply={onApply}
                  />
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
  );
});

export default function ChatPanel() {
  const chatHistory = useWorkspaceStore((s) => s.chatHistory);
  const isAiTyping = useWorkspaceStore((s) => s.isAiTyping);
  const addChatMessage = useWorkspaceStore((s) => s.addChatMessage);
  const setIsAiTyping = useWorkspaceStore((s) => s.setIsAiTyping);
  const clearChat = useWorkspaceStore((s) => s.clearChat);
  const folders = useWorkspaceStore((s) => s.folders);
  const activeFile = useWorkspaceStore((s) => s.activeFile);
  const openFiles = useWorkspaceStore((s) => s.openFiles);
  const updateFile = useWorkspaceStore((s) => s.updateFile);
  const openFile = useWorkspaceStore((s) => s.openFile);
  const aiProvider = useWorkspaceStore((s) => s.aiProvider);

  const [isLoading, setIsLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [providerOpen, setProviderOpen] = useState(false);
  const { status } = useApiHealth({ pollingInterval: 30000 });

  const applyOneFile = useCallback(
    (path: string, content: string) => {
      updateFile(path, content);
      openFile(path);
      setToast(`Applied ${path}`);
      window.setTimeout(() => setToast(null), 2000);
    },
    [updateFile, openFile]
  );

  const buildProjectFiles = useCallback(() => {
    const out: Record<string, string> = {};
    const all = useWorkspaceStore.getState().files || {};
    for (const [path, content] of Object.entries(all)) {
      if (typeof content === 'string' && content.length < 80000) out[path] = content;
    }
    return out;
  }, []);

  const handleSend = useCallback(
    async (text: string) => {
      const message = text.trim();
      if (!message || isLoading || isAiTyping) return;

      addChatMessage('user', message);
      setIsLoading(true);
      setIsAiTyping(true);

      try {
        const projectFiles = buildProjectFiles();
        const res = await fetch(`${API_BASE_URL}/ai/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message,
            files: projectFiles,
            folders: folders || [],
            activeFile: activeFile || null,
            openFiles: openFiles || [],
            provider: aiProvider?.provider || 'openrouter',
            preferredOpenRouterModel: aiProvider?.preferredOpenRouterModel || null,
            skipApply: true,
          }),
        });

        const data = (await res.json()) as ChatResponse;
        if (!res.ok || data.success === false) {
          addChatMessage(
            'assistant',
            data.error || data.response || `Request failed (${res.status})`
          );
        } else {
          addChatMessage('assistant', data.response || data.rawContent || 'No response.');
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Network error';
        addChatMessage('assistant', `Failed to reach AI: ${msg}`);
      } finally {
        setIsLoading(false);
        setIsAiTyping(false);
      }
    },
    [
      isLoading,
      isAiTyping,
      addChatMessage,
      setIsAiTyping,
      buildProjectFiles,
      folders,
      activeFile,
      openFiles,
      aiProvider,
    ]
  );

  useEffect(() => {
    const onSuggestion = (e: Event) => {
      const prompt = (e as CustomEvent<string>).detail;
      if (typeof prompt === 'string' && prompt.trim()) {
        void handleSend(prompt.trim());
      }
    };
    window.addEventListener('chat-suggestion', onSuggestion);
    return () => window.removeEventListener('chat-suggestion', onSuggestion);
  }, [handleSend]);

  const setProvider = useCallback((p: 'openrouter' | 'groq' | 'gemini') => {
    useWorkspaceStore.getState().setAiProvider({ provider: p });
    setProviderOpen(false);
  }, []);

  const online = status === 'online';
  const busy = isLoading || isAiTyping;

  return (
    <div className="h-full min-h-0 flex flex-col bg-[#0d1117] border-l border-[#30363d]">
      <div className="shrink-0 h-10 px-3 border-b border-[#30363d] flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Bot className="w-3.5 h-3.5 text-[#8b949e] shrink-0" />
          <span className="text-[12px] font-semibold text-[#c9d1d9] truncate">AI Assistant</span>
          <span
            className={`inline-flex items-center gap-1 text-[10px] ${
              online ? 'text-[#3fb950]' : 'text-[#f85149]'
            }`}
            title={online ? 'API online' : 'API offline'}
          >
            <Circle className={`w-1.5 h-1.5 fill-current ${online ? '' : 'opacity-80'}`} />
            {online ? 'Online' : 'Offline'}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="relative">
            <button
              type="button"
              onClick={() => setProviderOpen((v) => !v)}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded border border-[#30363d] bg-[#161b22] hover:bg-[#21262d] text-[10px] text-[#8b949e]"
            >
              {aiProvider?.provider || 'openrouter'}
              <ChevronDown className="w-3 h-3" />
            </button>
            {providerOpen && (
              <div className="absolute right-0 top-full mt-1 z-50 min-w-[120px] rounded border border-[#30363d] bg-[#161b22] shadow-xl py-1">
                {(['openrouter', 'groq', 'gemini'] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setProvider(p)}
                    className="w-full text-left px-3 py-1.5 text-[11px] text-[#c9d1d9] hover:bg-[#21262d]"
                  >
                    {p}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => clearChat()}
            title="Clear chat history"
            className="p-1 rounded border border-[#30363d] bg-[#161b22] hover:bg-[#21262d] text-[#8b949e] hover:text-[#f85149]"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <MessageList
        chatHistory={chatHistory}
        isAiTyping={isAiTyping}
        activeFile={activeFile || ''}
        onApply={applyOneFile}
      />

      {toast && (
        <div className="mx-3 mb-1 px-2.5 py-1.5 text-[11px] text-[#3fb950] bg-[#238636]/15 border border-[#238636]/30 rounded">
          {toast}
        </div>
      )}

      <ChatInputBar disabled={busy} onSend={handleSend} />
    </div>
  );
}

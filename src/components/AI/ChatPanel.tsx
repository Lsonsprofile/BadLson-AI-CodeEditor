// src/components/AI/ChatPanel.tsx
// ─────────────────────────────────────────────────────────────────────
// AI Chat Panel — Full featured with provider switching, stop, copy
// ─────────────────────────────────────────────────────────────────────

import { useState, useRef, useEffect } from 'react';
import { 
  Send, Bot, User, Loader2, Sparkles, X, 
  Square, Copy, Check, Globe, Zap, Brain,
  ChevronDown, Code, Bug, Lightbulb, Wand2
} from 'lucide-react';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { useApiHealth } from '@/hooks/useApiHealth';
import { PROVIDER_CONFIG, type AiProviderKey } from '@/ai/providerConfig';

// ─── SUGGESTIONS ─────────────────────────────────────────────────────

const AI_SUGGESTIONS = [
  { icon: Wand2, text: 'Make the hero headline larger and purple', color: 'text-violet-400' },
  { icon: Code, text: 'Add an interactive FAQ list with slide details', color: 'text-blue-400' },
  { icon: Lightbulb, text: 'Add a dark/light mode toggle function', color: 'text-yellow-400' },
  { icon: Bug, text: 'Fix any responsive issues in the CSS', color: 'text-red-400' },
];

// ─── MAIN COMPONENT ─────────────────────────────────────────────────

export default function ChatPanel() {
  // ─── STORE ──────────────────────────────────────────────────────────

  const { 
    chatHistory, 
    isAiTyping, 
    addChatMessage, 
    setIsAiTyping, 
    authUser,
    aiProvider,
    setAiProvider,
    files,
    activeFile,
    openFiles
  } = useWorkspaceStore();

  // ─── LOCAL STATE ──────────────────────────────────────────────────

  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ─── API HEALTH ──────────────────────────────────────────────────

  const { status: apiStatus } = useApiHealth({
    pollingInterval: 30000,
    onStatusChange: (status) => {
      console.log(`[ChatPanel] API status changed to: ${status}`);
    },
  });

  // ─── AUTO-SCROLL ──────────────────────────────────────────────────

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, isAiTyping]);

  // ─── FOCUS INPUT ──────────────────────────────────────────────────

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // ─── HANDLE SEND ──────────────────────────────────────────────────

  const handleSend = async () => {
    if (!input.trim() || isLoading || isAiTyping) return;

    const userMessage = input.trim();
    setInput('');
    setIsLoading(true);
    setErrorMessage(null);

    addChatMessage('user', userMessage);
    console.log('📤 Sending:', userMessage);

    try {
      setIsAiTyping(true);

      // ✅ Build project files from workspace
      const projectFiles: Record<string, string> = {};
      for (const [path, content] of Object.entries(files)) {
        if (content && content.trim()) {
          projectFiles[path] = content;
        }
      }

      console.log(`📁 Sending ${Object.keys(projectFiles).length} files`);

      // ✅ Use the working API call with file context
      const response = await fetch('http://localhost:5002/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          projectFiles: projectFiles, // ✅ Now sends files
          chatHistory: chatHistory.slice(-10).map(msg => ({
            role: msg.role,
            content: msg.content
          })),
          provider: aiProvider.provider || 'openrouter',
          activeFile: activeFile || null,
          recentFiles: openFiles.slice(-5),
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `HTTP ${response.status}`);
      }

      const data = await response.json();
      console.log('📥 Response:', data);

      if (data.response) {
        addChatMessage('ai', data.response);
        console.log('✅ AI response added');
      } else {
        throw new Error('No response from AI');
      }
    } catch (error) {
      console.error('❌ Error:', error);
      const msg = error instanceof Error ? error.message : 'Unknown error';
      setErrorMessage(msg);
      addChatMessage('ai', `⚠️ Error: ${msg}`);
    } finally {
      setIsAiTyping(false);
      setIsLoading(false);
    }
  };

  // ─── HANDLE STOP ──────────────────────────────────────────────────

  const handleStop = () => {
    setIsAiTyping(false);
    setIsLoading(false);
    console.log('⏹️ Generation stopped by user');
  };

  // ─── HANDLE COPY ──────────────────────────────────────────────────

  const handleCopy = async (text: string, index: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  // ─── HANDLE SUGGESTION CLICK ──────────────────────────────────────

  const handleSuggestionClick = (text: string) => {
    setInput(text);
    inputRef.current?.focus();
  };

  // ─── HANDLE PROVIDER SWITCH ──────────────────────────────────────

  const handleProviderSwitch = (provider: AiProviderKey) => {
    setAiProvider({ provider });
    setIsDropdownOpen(false);
    console.log('🔄 Switched to provider:', provider);
  };

  // ─── HANDLE KEY DOWN ─────────────────────────────────────────────

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ─── HANDLE CLEAR ─────────────────────────────────────────────────

  const handleClear = () => {
    if (chatHistory.length === 0) return;
    if (chatHistory.length > 5 && !window.confirm(`Clear all ${chatHistory.length} messages?`)) return;
    useWorkspaceStore.setState({ chatHistory: [] });
    setErrorMessage(null);
  };

  const isBusy = isLoading || isAiTyping;

  // ─── RENDER ──────────────────────────────────────────────────────

  return (
    <div className="w-full h-full bg-[#0b0f19] flex flex-col border-l border-[#1e293b]">
      {/* ─── HEADER ────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#1e293b] shrink-0 bg-[#0d1117]">
        <div className="flex items-center gap-3">
          <Sparkles className="w-4 h-4 text-violet-400" />
          <span className="text-sm font-medium text-white">AI Assistant</span>
          <span className={`text-[9px] px-2 py-0.5 rounded-full ${
            apiStatus === 'online' 
              ? 'bg-emerald-500/20 text-emerald-400' 
              : 'bg-red-500/20 text-red-400'
          }`}>
            {apiStatus === 'online' ? '● Online' : '● Offline'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* ─── Provider Dropdown ────────────────────────────────── */}
          <div className="relative">
            <button
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#1a2035] border border-[#1e293b] hover:border-indigo-500/50 transition text-[10px] text-slate-300"
            >
              {aiProvider.provider === 'openrouter' && <Globe className="w-3 h-3 text-emerald-400" />}
              {aiProvider.provider === 'groq' && <Zap className="w-3 h-3 text-amber-400" />}
              {aiProvider.provider === 'gemini' && <Brain className="w-3 h-3 text-blue-400" />}
              <span>{PROVIDER_CONFIG[aiProvider.provider as AiProviderKey]?.label || aiProvider.provider}</span>
              <ChevronDown className="w-3 h-3 text-slate-500" />
            </button>
            
            {isDropdownOpen && (
              <div className="absolute right-0 mt-1 w-48 rounded-lg border border-[#1e293b] bg-[#0d1117] shadow-2xl z-50 overflow-hidden">
                {(Object.keys(PROVIDER_CONFIG) as AiProviderKey[]).map((key) => (
                  <button
                    key={key}
                    onClick={() => handleProviderSwitch(key)}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-[#1a2035] transition ${
                      aiProvider.provider === key ? 'bg-indigo-500/10 text-indigo-400' : 'text-slate-300'
                    }`}
                  >
                    {key === 'openrouter' && <Globe className="w-3.5 h-3.5 text-emerald-400" />}
                    {key === 'groq' && <Zap className="w-3.5 h-3.5 text-amber-400" />}
                    {key === 'gemini' && <Brain className="w-3.5 h-3.5 text-blue-400" />}
                    {PROVIDER_CONFIG[key].label}
                    <span className="text-[9px] text-slate-500 ml-auto">{PROVIDER_CONFIG[key].desc}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <span className="text-[10px] text-slate-500">{chatHistory.length} msgs</span>
          <button
            onClick={handleClear}
            disabled={chatHistory.length === 0}
            className="p-1.5 rounded hover:bg-[#1a2035] transition disabled:opacity-30"
          >
            <X className="w-3.5 h-3.5 text-slate-400" />
          </button>
        </div>
      </div>

      {/* ─── MESSAGES ────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {chatHistory.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Bot className="w-12 h-12 text-slate-600 mb-3" />
            <p className="text-sm text-slate-400">Start a conversation with the AI</p>
            <p className="text-[11px] text-slate-500 mt-1">Ask about your code, get help, or brainstorm ideas</p>
            
            {/* ─── Suggestions ───────────────────────────────────── */}
            <div className="flex flex-wrap justify-center gap-2 mt-4 max-w-md">
              {AI_SUGGESTIONS.map((suggestion, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSuggestionClick(suggestion.text)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#1a2035] border border-[#1e293b] hover:border-indigo-500/50 transition text-[10px] text-slate-400 hover:text-slate-200"
                >
                  <suggestion.icon className={`w-3 h-3 ${suggestion.color}`} />
                  <span className="max-w-[120px] truncate">{suggestion.text}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {chatHistory.map((msg, index) => (
              <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-lg px-4 py-2 ${
                  msg.role === 'user'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-[#1a2035] text-slate-200 border border-[#1e293b]'
                }`}>
                  <div className="flex items-center gap-2 mb-1">
                    {msg.role === 'user' ? (
                      <User className="w-3.5 h-3.5 opacity-70" />
                    ) : (
                      <Bot className="w-3.5 h-3.5 opacity-70" />
                    )}
                    <span className="text-[10px] opacity-70">
                      {msg.role === 'user' ? 'You' : 'AI Assistant'}
                    </span>
                    {msg.role === 'assistant' && (
                      <button
                        onClick={() => handleCopy(msg.content, index)}
                        className="ml-auto opacity-50 hover:opacity-100 transition"
                      >
                        {copiedIndex === index ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    )}
                  </div>
                  <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                  <p className="text-[9px] opacity-40 mt-1">
                    {new Date(msg.timestamp).toLocaleTimeString()}
                  </p>
                </div>
              </div>
            ))}
            
            {/* ─── Typing indicator ────────────────────────────────── */}
            {isAiTyping && (
              <div className="flex justify-start">
                <div className="bg-[#1a2035] text-slate-400 rounded-lg px-4 py-2 border border-[#1e293b]">
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm">AI is thinking...</span>
                  </div>
                </div>
              </div>
            )}

            {/* ─── Error message ──────────────────────────────────── */}
            {errorMessage && (
              <div className="flex justify-center">
                <div className="bg-red-500/10 text-red-400 rounded-lg px-4 py-2 border border-red-500/20 text-sm max-w-[90%]">
                  ⚠️ {errorMessage}
                </div>
              </div>
            )}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* ─── STATUS BAR ───────────────────────────────────────────── */}
      <div className="px-3 py-1 bg-[#0d1117] border-t border-[#1e293b] shrink-0 flex flex-wrap items-center gap-2 text-[9px] text-slate-500">
        {isBusy && (
          <span className="text-violet-400 flex items-center gap-1">
            <Loader2 className="w-3 h-3 animate-spin" />
            Sending...
          </span>
        )}
        {authUser ? (
          <span className="text-emerald-400/60">✓ Saved workspace</span>
        ) : (
          <span className="text-slate-500">💡 Login to save workspace</span>
        )}
        <span className="ml-auto">
          {chatHistory.length} messages • {Object.keys(files).length} files
        </span>
      </div>

      {/* ─── INPUT AREA ───────────────────────────────────────────── */}
      <div className="p-3 bg-[#0d1117] border-t border-[#1e293b] shrink-0">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your code..."
            disabled={isBusy}
            className="flex-1 rounded-md border border-[#1e293b] bg-[#111625] px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-indigo-500 disabled:opacity-50"
          />
          {isBusy ? (
            <button
              onClick={handleStop}
              className="rounded-md bg-red-600 px-3 py-2 text-white hover:bg-red-500 transition"
            >
              <Square className="w-5 h-5" />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!input.trim() || isBusy}
              className="rounded-md bg-indigo-600 px-3 py-2 text-white hover:bg-indigo-500 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send className="w-5 h-5" />
            </button>
          )}
        </div>
        <div className="flex justify-between mt-1.5 px-1">
          <p className="text-[9px] text-slate-500">Shift + Enter for new line</p>
          <p className="text-[9px] text-slate-500">
            {isBusy ? '⏹️ Click stop to cancel' : `Using ${PROVIDER_CONFIG[aiProvider.provider as AiProviderKey]?.label || aiProvider.provider}`}
          </p>
        </div>
      </div>
    </div>
  );
}
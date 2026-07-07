// src/components/AI/ChatPanel.tsx
import { useState, useRef, useEffect, useCallback, memo } from 'react';
import {
  Sparkles,
  Send,
  Trash2,
  Loader2,
  Wand2,
  Code,
  Bug,
  Lightbulb,
  ChevronRight,
  Wifi,
  WifiOff,
  AlertTriangle,
  ChevronDown,
  Zap,
  Brain,
  Globe,
  CheckCircle2,
  XCircle,
  FileEdit,
} from 'lucide-react';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { 
  sendChatMessageWithStore, 
  streamChatMessageWithStore,
  getRecentConsoleErrors,
  getRecentBuildErrors,
  clearCapturedErrors,
  type ChatApiResponse,
  type CursorPosition,
} from '../../services/api';
import Message from './Message';

const MAX_MESSAGES = 20;

const suggestions = [
  { icon: Wand2, text: 'Make the hero headline larger and purple', color: 'text-violet-400' },
  { icon: Code, text: 'Add an interactive FAQ list with slide details', color: 'text-blue-400' },
  { icon: Lightbulb, text: 'Add a dark/light mode toggle function', color: 'text-yellow-400' },
  { icon: Bug, text: 'Fix any responsive issues in the CSS', color: 'text-red-400' },
  { icon: Loader2, text: 'Add smooth scroll animations', color: 'text-emerald-400' },
];

const PROVIDER_CONFIG = {
  openrouter: { 
    label: 'OpenRouter', 
    color: 'text-emerald-400', 
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/20',
    icon: Globe,
    desc: 'Free models rotation',
  },
  groq: { 
    label: 'Groq', 
    color: 'text-amber-400', 
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/20',
    icon: Zap,
    desc: 'Fast inference',
  },
  gemini: { 
    label: 'Gemini', 
    color: 'text-blue-400', 
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/20',
    icon: Brain,
    desc: 'Google AI',
  },
};

interface EditNotification {
  filename: string;
  type: 'created' | 'replaced' | 'appended' | 'unchanged';
  status: 'success' | 'failed';
}

const ChatInput = memo(function ChatInput({ 
  onSend, 
  isLoading 
}: { 
  onSend: (text: string) => void;
  isLoading: boolean;
}) {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const resize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, []);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    requestAnimationFrame(resize);
  }, [resize]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (input.trim() && !isLoading) {
        onSend(input.trim());
        setInput('');
        requestAnimationFrame(() => {
          if (textareaRef.current) textareaRef.current.style.height = 'auto';
        });
      }
    }
  }, [input, isLoading, onSend]);

  const handleClickSend = useCallback(() => {
    if (input.trim() && !isLoading) {
      onSend(input.trim());
      setInput('');
      requestAnimationFrame(() => {
        if (textareaRef.current) textareaRef.current.style.height = 'auto';
      });
    }
  }, [input, isLoading, onSend]);

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={input}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        rows={1}
        placeholder="Ask anything..."
        className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg py-2 pl-3 pr-9 text-xs text-[#c9d1d9] resize-none focus:outline-none focus:border-[#58a6ff] focus:ring-1 focus:ring-[#58a6ff]/20 transition-all placeholder:text-[#484f58]"
        spellCheck={false}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        disabled={isLoading}
      />
      <button
        onClick={handleClickSend}
        disabled={!input.trim() || isLoading}
        className="absolute bottom-1.5 right-1.5 p-1 rounded-md bg-[#238636] hover:bg-[#2ea043] disabled:bg-[#30363d] disabled:opacity-50 transition-colors"
        aria-label="Send message"
      >
        <Send className="w-3 h-3 text-white" />
      </button>
    </div>
  );
});

const SuggestionButton = memo(function SuggestionButton({ 
  item, 
  onClick 
}: { 
  item: typeof suggestions[0]; 
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left text-[11px] text-[#8b949e] bg-[#161b22] hover:bg-[#21262d] border border-[#30363d] hover:border-[#58a6ff] rounded-md px-2.5 py-1.5 transition-all duration-200 flex items-center gap-1.5 group"
    >
      <item.icon className={`w-3 h-3 ${item.color} group-hover:scale-110 transition-transform shrink-0`} />
      <span className="truncate">{item.text}</span>
      <ChevronRight className="w-3 h-3 ml-auto opacity-0 group-hover:opacity-100 transition-opacity text-[#58a6ff] shrink-0" />
    </button>
  );
});

const EditStatusBar = memo(function EditStatusBar({ 
  edits 
}: { 
  edits: EditNotification[] 
}) {
  if (edits.length === 0) return null;
  
  return (
    <div className="px-3 py-2 bg-[#161b22] border-b border-[#21262d] space-y-1">
      <div className="text-[9px] text-[#8b949e] uppercase tracking-wider font-medium mb-1">
        Applied Changes
      </div>
      {edits.map((edit, i) => (
        <div key={i} className="flex items-center gap-1.5 text-[10px]">
          {edit.status === 'success' ? (
            <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
          ) : (
            <XCircle className="w-3 h-3 text-red-400 shrink-0" />
          )}
          <FileEdit className="w-3 h-3 text-[#58a6ff] shrink-0" />
          <span className={edit.status === 'success' ? 'text-emerald-300' : 'text-red-300'}>
            {edit.filename}
          </span>
          <span className="text-[#484f58]">({edit.type})</span>
        </div>
      ))}
    </div>
  );
});

export default function ChatPanel() {
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [apiStatus, setApiStatus] = useState<'unknown' | 'online' | 'offline'>('unknown');
  const [showProviderDropdown, setShowProviderDropdown] = useState(false);
  const [appliedEdits, setAppliedEdits] = useState<EditNotification[]>([]);
  const [streamingContent, setStreamingContent] = useState('');
  const providerDropdownRef = useRef<HTMLDivElement>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);

  const { 
    files, 
    activeFile,
    chatHistory, 
    addChatMessage, 
    clearChat, 
    setIsAiTyping,
    isAiTyping,
    aiProvider,
    setAiProvider,
    updateFile,
  } = useWorkspaceStore();

  const providerConfig = PROVIDER_CONFIG[aiProvider.provider];

  // ─── API STATUS CHECK ─────────────────────────────────────────────
  useEffect(() => {
    const testConnection = async () => {
      try {
        const response = await fetch('http://localhost:5002/api/health', { method: 'GET' });
        setApiStatus(response.ok ? 'online' : 'offline');
      } catch {
        setApiStatus('offline');
      }
    };
    testConnection();
    const interval = setInterval(testConnection, 30000);
    return () => clearInterval(interval);
  }, []);

  // ─── SCROLL HANDLING ──────────────────────────────────────────────
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      setShouldAutoScroll(scrollHeight - scrollTop - clientHeight <= 24);
    };
    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (shouldAutoScroll && chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [chatHistory, streamingContent, shouldAutoScroll]);

  useEffect(() => {
    if ((isLoading || isStreaming) && chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [isLoading, isStreaming]);

  // ─── DROPDOWN OUTSIDE CLICK ───────────────────────────────────────
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (providerDropdownRef.current && !providerDropdownRef.current.contains(e.target as Node)) {
        setShowProviderDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ─── GET EDITOR CONTEXT ───────────────────────────────────────────
  const getEditorContext = useCallback(() => {
    const selectedCode = (window as any).__selectedEditorText || null;
    const cursorPosition: CursorPosition | null = (window as any).__editorCursor || null;
    return { selectedCode, cursorPosition };
  }, []);

  // ─── APPLY AI EDITS ───────────────────────────────────────────────
  const applyAiEdits = useCallback((response: ChatApiResponse) => {
    if (!response.edits?.applied?.length && !response.updatedFiles) return;

    const notifications: EditNotification[] = [];

    // Apply updated files from backend
    if (response.updatedFiles) {
      Object.entries(response.updatedFiles).forEach(([filename, content]) => {
        const existing = files[filename];
        let type: EditNotification['type'] = 'unchanged';
        
        if (!existing) type = 'created';
        else if (content !== existing) type = 'replaced';
        
        if (type !== 'unchanged') {
          updateFile(filename, content);
        }
        
        notifications.push({ filename, type, status: 'success' });
      });
    }

    // Track failed edits
    response.edits?.failed?.forEach(({ filename, reason }) => {
      notifications.push({ filename, type: 'unchanged', status: 'failed' });
      console.warn(`AI edit failed for ${filename}:`, reason);
    });

    if (notifications.length > 0) {
      setAppliedEdits(prev => [...prev, ...notifications].slice(-10));
      // Clear after 8 seconds
      setTimeout(() => setAppliedEdits(prev => prev.filter(n => !notifications.includes(n))), 8000);
    }

    // Clear captured errors after successful AI response
    clearCapturedErrors();
  }, [files, updateFile]);

  // ─── HANDLE SEND (NON-STREAMING) ──────────────────────────────────
  const handleSendStandard = useCallback(async (userMessage: string) => {
    if (!userMessage || isLoading) return;
    
    addChatMessage('user', userMessage);
    setIsLoading(true);
    setIsAiTyping(true);
    setErrorMessage(null);
    setAppliedEdits([]);

    try {
      const recentHistory = chatHistory.slice(-10);
      const { selectedCode, cursorPosition } = getEditorContext();
      
      const response = await sendChatMessageWithStore(
        userMessage, 
        recentHistory,
        aiProvider.provider,
        aiProvider.preferredOpenRouterModel,
        activeFile || undefined,
        selectedCode || undefined,
        cursorPosition || undefined
      );

      const aiMessage = response?.response?.trim() || 'The AI returned an empty response.';
      addChatMessage('ai', aiMessage);
      
      // Apply any edits the AI suggested
      applyAiEdits(response);
      
      setApiStatus('online');
    } catch (error) {
      console.error('Chat error:', error);
      const message = error instanceof Error ? error.message : 'Unknown AI service error';
      setErrorMessage(message);
      setApiStatus('offline');
      addChatMessage(
        'ai', 
        `⚠️ AI service error: ${message}\n\nPlease check:\n• Backend server is running (npm run start)\n• ${aiProvider.provider === 'openrouter' ? 'OPENROUTER_API_KEY' : aiProvider.provider === 'groq' ? 'GROQ_API_KEY' : 'GEMINI_API_KEY'} is set in backend/.env\n• Network connection is stable`
      );
    } finally {
      setIsLoading(false);
      setIsAiTyping(false);
    }
  }, [isLoading, activeFile, chatHistory, addChatMessage, setIsAiTyping, aiProvider, getEditorContext, applyAiEdits]);

  // ─── HANDLE SEND (STREAMING) ──────────────────────────────────────
  const handleSendStream = useCallback(async (userMessage: string) => {
    if (!userMessage || isStreaming) return;
    
    addChatMessage('user', userMessage);
    setIsStreaming(true);
    setIsAiTyping(true);
    setErrorMessage(null);
    setStreamingContent('');
    setAppliedEdits([]);

    const recentHistory = chatHistory.slice(-10);
    const { selectedCode, cursorPosition } = getEditorContext();

    let fullResponse = '';

    try {
      await streamChatMessageWithStore(
        userMessage,
        {
          onChunk: (chunk) => {
            fullResponse += chunk;
            setStreamingContent(fullResponse);
          },
          onDone: (metadata) => {
            console.log(`[AI] Stream complete: ${metadata.provider}/${metadata.model}, mode: ${metadata.mode}`);
          },
          onError: (error) => {
            console.error('[AI] Stream error:', error);
            setErrorMessage(error);
          },
        },
        recentHistory,
        aiProvider.provider,
        aiProvider.preferredOpenRouterModel,
        activeFile || undefined,
        selectedCode || undefined,
        cursorPosition || undefined
      );

      // Add the complete streamed message to chat history
      const finalMessage = fullResponse.trim() || 'The AI returned an empty response.';
      addChatMessage('ai', finalMessage);
      setStreamingContent('');
      setApiStatus('online');
      clearCapturedErrors();
    } catch (error) {
      console.error('Stream error:', error);
      const message = error instanceof Error ? error.message : 'Unknown AI service error';
      setErrorMessage(message);
      setApiStatus('offline');
      
      // If we got partial content, show it
      if (fullResponse.trim()) {
        addChatMessage('ai', fullResponse.trim() + '\n\n*[Stream interrupted]*');
      } else {
        addChatMessage(
          'ai', 
          `⚠️ AI streaming error: ${message}\n\nPlease check:\n• Backend server is running (npm run start)\n• ${aiProvider.provider === 'openrouter' ? 'OPENROUTER_API_KEY' : aiProvider.provider === 'groq' ? 'GROQ_API_KEY' : 'GEMINI_API_KEY'} is set in backend/.env\n• Network connection is stable`
        );
      }
    } finally {
      setIsStreaming(false);
      setIsAiTyping(false);
    }
  }, [isStreaming, activeFile, chatHistory, addChatMessage, setIsAiTyping, aiProvider, getEditorContext]);

  // ─── CHOOSE SEND MODE ─────────────────────────────────────────────
  // Use streaming for Gemini (real streaming), standard for others (faster for small responses)
  const handleSend = useCallback((userMessage: string) => {
    if (aiProvider.provider === 'gemini') {
      return handleSendStream(userMessage);
    }
    return handleSendStandard(userMessage);
  }, [aiProvider.provider, handleSendStandard, handleSendStream]);

  const handleProviderSwitch = useCallback((provider: 'openrouter' | 'groq' | 'gemini') => {
    setAiProvider({ provider });
    setShowProviderDropdown(false);
  }, [setAiProvider]);

  const handleClear = useCallback(() => {
    const messageCount = chatHistory.length;
    if (messageCount === 0) return;
    if (messageCount > 5 && !window.confirm(`Clear all ${messageCount} messages?`)) return;
    clearChat();
    setErrorMessage(null);
    setAppliedEdits([]);
    setStreamingContent('');
  }, [chatHistory.length, clearChat]);

  // ─── RENDER ───────────────────────────────────────────────────────
  return (
    <div className="w-full h-full bg-[#0d1117] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-[#161b22] border-b border-[#21262d] shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-violet-600 flex items-center justify-center">
            <Sparkles className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="text-xs font-semibold text-[#c9d1d9]">AI Assistant</span>

          <div className="relative" ref={providerDropdownRef}>
            <button
              onClick={() => setShowProviderDropdown(!showProviderDropdown)}
              className={`flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full ${providerConfig.bg} ${providerConfig.color} border ${providerConfig.border} hover:brightness-110 transition-all`}
            >
              <providerConfig.icon className="w-2.5 h-2.5" />
              {providerConfig.label}
              <ChevronDown className={`w-2.5 h-2.5 transition-transform ${showProviderDropdown ? 'rotate-180' : ''}`} />
            </button>

            {showProviderDropdown && (
              <div className="absolute top-full left-0 mt-1 w-40 bg-[#161b22] border border-[#30363d] rounded-lg shadow-xl z-50 overflow-hidden">
                {(Object.entries(PROVIDER_CONFIG) as [string, typeof PROVIDER_CONFIG.openrouter][]).map(([key, config]) => {
                  const isActive = aiProvider.provider === key;
                  return (
                    <button
                      key={key}
                      onClick={() => handleProviderSwitch(key as 'openrouter' | 'groq' | 'gemini')}
                      className={`w-full flex items-center gap-2 px-2.5 py-2 text-left hover:bg-[#21262d] transition-colors ${
                        isActive ? 'bg-[#21262d]' : ''
                      }`}
                    >
                      <config.icon className={`w-3.5 h-3.5 ${config.color}`} />
                      <div className="flex flex-col">
                        <span className={`text-[10px] font-medium ${config.color}`}>
                          {config.label}
                          {isActive && <span className="text-[#8b949e] font-normal ml-1">(active)</span>}
                        </span>
                        <span className="text-[9px] text-[#484f58]">{config.desc}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {activeFile && (
            <span className="text-[9px] text-[#8b949e] truncate max-w-[80px]" title={activeFile}>
              {activeFile}
            </span>
          )}

          {apiStatus === 'online' ? (
            <Wifi className="w-3 h-3 text-emerald-400" aria-label="AI service online" />
          ) : apiStatus === 'offline' ? (
            <WifiOff className="w-3 h-3 text-red-400" aria-label="AI service offline" />
          ) : null}
          {chatHistory.length > 0 && (
            <span className="text-[9px] text-[#8b949e] bg-[#21262d] px-1.5 py-0.5 rounded-full">
              {chatHistory.length}
            </span>
          )}
        </div>
        {chatHistory.length > 0 && (
          <button
            onClick={handleClear}
            className="p-1 text-[#8b949e] hover:text-[#f85149] hover:bg-[#21262d] rounded transition"
            aria-label="Clear chat history"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Edit Status Bar */}
      <EditStatusBar edits={appliedEdits} />

      {/* Messages Area */}
      <div 
        ref={scrollContainerRef} 
        className="flex-1 overflow-y-auto px-3 py-3 space-y-3 custom-scrollbar"
        style={{ minHeight: '100px' }}
      >
        {errorMessage && (
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-2.5 text-[11px] text-red-200">
            <strong>⚠️ Error:</strong> {errorMessage}
          </div>
        )}

        {chatHistory.length === 0 && !errorMessage && !isStreaming && (
          <div className="space-y-3">
            <div className="flex items-start gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-violet-600 flex items-center justify-center shrink-0">
                <Sparkles className="w-3.5 h-3.5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-[#c9d1d9] mb-3 leading-relaxed">
                  Hello! I'm your AI coding assistant. I can help you write, debug, and improve your code.
                  <br />
                  <span className="text-[#8b949e] text-[10px]">Try one of these suggestions:</span>
                </p>
                <div className="space-y-1.5">
                  {suggestions.map((item) => (
                    <SuggestionButton 
                      key={item.text} 
                      item={item} 
                      onClick={() => handleSend(item.text)} 
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Rendered chat history */}
        {chatHistory.map((msg, index) => (
          <Message 
            key={`${msg.timestamp}-${index}`}
            role={msg.role} 
            content={msg.content} 
            timestamp={msg.timestamp} 
          />
        ))}

        {/* Streaming message (live) */}
        {isStreaming && streamingContent && (
          <Message
            role="ai"
            content={streamingContent}
            timestamp={Date.now()}
            isStreaming
          />
        )}

        {/* Loading indicator */}
        {(isLoading || (isStreaming && !streamingContent)) && (
          <div className="flex items-center gap-2 px-2 py-1">
            <div className="w-6 h-6 rounded bg-violet-600 flex items-center justify-center animate-pulse">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
            </div>
            <span className="text-[11px] text-[#8b949e]">
              {isStreaming ? 'AI is typing...' : 'AI is thinking...'}
            </span>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-2.5 bg-[#161b22] border-t border-[#21262d] shrink-0">
        <div className="flex items-center justify-between mb-1.5 px-1">
          <span className={`text-[9px] ${chatHistory.length >= MAX_MESSAGES ? 'text-[#f85149]' : 'text-[#484f58]'}`}>
            {chatHistory.length}/{MAX_MESSAGES} messages
          </span>
          <span className="text-[9px] text-[#484f58]">
            {isLoading ? `Sending via ${providerConfig.label}...` : 
             isStreaming ? 'Streaming...' : 
             'Shift + Enter for new line'}
          </span>
        </div>
        
        <ChatInput onSend={handleSend} isLoading={isLoading || isStreaming} />
      </div>
    </div>
  );
}
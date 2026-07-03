import { useState, useRef, useEffect } from 'react';
import {
  Sparkles,
  Send,
  Trash2,
  Loader2,
  Zap,
  Code,
  Bug,
  Wand2,
  Lightbulb,
} from 'lucide-react';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { sendChatMessage } from '../../services/api';
import Message from './Message';

const suggestions = [
  {
    icon: Wand2,
    text: 'Make the hero headline larger and purple',
    color: 'text-violet-400',
  },
  {
    icon: Code,
    text: 'Add an interactive FAQ list with slide details',
    color: 'text-blue-400',
  },
  {
    icon: Lightbulb,
    text: 'Add a dark/light mode toggle function',
    color: 'text-yellow-400',
  },
  {
    icon: Bug,
    text: 'Fix any responsive issues in the CSS',
    color: 'text-red-400',
  },
  {
    icon: Zap,
    text: 'Add smooth scroll animations',
    color: 'text-emerald-400',
  },
];

export default function ChatPanel() {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);

  const {
    files,
    chatHistory,
    addChatMessage,
    clearChat,
    setIsAiTyping,
    aiPanelVisible,
  } = useWorkspaceStore();

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const isAtBottom = scrollHeight - scrollTop - clientHeight <= 24;
      setShouldAutoScroll(isAtBottom);
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => {
      container.removeEventListener('scroll', handleScroll);
    };
  }, []);

  useEffect(() => {
    if (!shouldAutoScroll) return;
    chatEndRef.current?.scrollIntoView({
      behavior: 'smooth',
    });
  }, [chatHistory, isLoading, shouldAutoScroll]);

  useEffect(() => {
    if (!textareaRef.current) return;

    textareaRef.current.style.height = 'auto';
    textareaRef.current.style.height = `${Math.min(
      textareaRef.current.scrollHeight,
      120
    )}px`;
  }, [input]);

  if (!aiPanelVisible) return null;

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();

    setInput('');
    addChatMessage('user', userMessage);

    setIsLoading(true);
    setIsAiTyping(true);
    setErrorMessage(null);

    try {
      const projectFiles: Record<string, string> = {};

      Object.entries(files).forEach(([filename, content]) => {
        projectFiles[filename] = String(content);
      });

      const response = await sendChatMessage(
        projectFiles,
        userMessage,
        chatHistory.slice(-10)
      );

      const aiMessage =
        response?.response?.trim() ??
        'The AI returned an empty response.';

      addChatMessage('ai', aiMessage);
    } catch (error) {
      console.error(error);

      const message =
        error instanceof Error
          ? error.message
          : 'Unknown AI service error';

      setErrorMessage(message);

      addChatMessage(
        'ai',
        'AI service is currently unavailable. Please verify the backend server, Gemini API key, or try again later.'
      );
    } finally {
      setIsLoading(false);
      setIsAiTyping(false);
    }
  };

  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLTextAreaElement>
  ) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSuggestion = (text: string) => {
    setInput(text);
    textareaRef.current?.focus();
  };

  return (
    <div className="w-80 bg-[#111625] border-l border-[#1e293b] flex flex-col shrink-0 min-h-0 h-full">
      <div className="panel-header">
        <div className="flex items-center gap-1.5">
          <Sparkles className="w-4 h-4 text-violet-400" />
          <span className="text-xs font-semibold text-white">
            AI Assistant
          </span>
        </div>

        <button
          onClick={clearChat}
          className="p-1 hover:bg-[#1a2035] rounded transition"
          title="Clear chat"
        >
          <Trash2 className="w-3.5 h-3.5 text-slate-500" />
        </button>
      </div>

      <div ref={scrollContainerRef} className="flex-1 min-h-0 h-full overflow-y-auto p-3 space-y-3 no-scrollbar">

        {errorMessage && (
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-[11px] text-red-200">
            <strong>AI Error:</strong> {errorMessage}
          </div>
        )}

        {chatHistory.length === 0 && (
          <div className="flex items-start gap-2">
            <div className="w-6 h-6 rounded-md bg-violet-600 flex items-center justify-center">
              <Sparkles className="w-3.5 h-3.5 text-white" />
            </div>

            <div className="flex-1 bg-[#161d30] border border-[#1e293b] rounded-lg p-3">

              <p className="text-[11px] text-slate-200">
                Hello! I'm your AI coding assistant.
              </p>

              <div className="mt-3 space-y-1">
                {suggestions.map((item) => (
                  <button
                    key={item.text}
                    onClick={() => handleSuggestion(item.text)}
                    className="w-full text-left text-[10px] text-slate-400 bg-[#0e121f] hover:bg-[#1a2035] border border-[#1e293b] rounded-md px-2 py-1.5 transition"
                  >
                    {item.text}
                  </button>
                ))}
              </div>

            </div>
          </div>
        )}

        {chatHistory.map((msg, index) => (
          <Message
            key={index}
            role={msg.role}
            content={msg.content}
            timestamp={msg.timestamp}
          />
        ))}

        {isLoading && (
          <div className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-violet-400" />
            <span className="text-xs text-slate-400">
              AI is thinking...
            </span>
          </div>
        )}

        <div ref={chatEndRef} />

      </div>

      <div className="border-t border-[#1e293b] bg-[#0e121f] px-3 py-1">
        <div className="flex justify-between text-[10px] text-slate-500">
          <span>AI Engine</span>
          <span className="text-emerald-400">
            Gemini 2.5
          </span>
        </div>
      </div>

      <div className="p-2 bg-[#161d30] border-t border-[#1e293b]">
        <div className="relative">

          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            placeholder="Ask anything about your code..."
            className="w-full bg-[#111625] border border-[#1e293b] rounded-lg py-2 pl-3 pr-10 text-[11px] text-white resize-none focus:outline-none focus:border-indigo-500"
          />

          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="absolute bottom-2 right-2 p-1 rounded bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700"
          >
            <Send className="w-3 h-3 text-white" />
          </button>

        </div>
      </div>
    </div>
  );
}
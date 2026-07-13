// src/components/AI/ChatMessages.tsx
import { memo, useRef, useEffect } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import Message from './Message';
import { type ChatMessage } from '../../services/api';

// ─── TYPES ───────────────────────────────────────────────────────────

export interface ChatMessagesProps {
  /** Array of chat messages */
  messages: ChatMessage[];
  /** Current streaming content (if any) */
  streamingContent: string;
  /** Whether streaming is in progress */
  isStreaming: boolean;
  /** Whether loading (non‑streaming) is in progress */
  isLoading: boolean;
  /** Optional error message to display */
  errorMessage?: string | null;
  /** Whether to auto-scroll to bottom on new messages */
  autoScroll?: boolean;
}

// ─── COMPONENT ──────────────────────────────────────────────────────

export const ChatMessages = memo(function ChatMessages({
  messages,
  streamingContent,
  isStreaming,
  isLoading,
  errorMessage,
  autoScroll = true,
}: ChatMessagesProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // Auto-scroll logic
  useEffect(() => {
    if (autoScroll && endRef.current) {
      endRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [messages, streamingContent, isLoading, isStreaming, autoScroll]);

  // ─── RENDER ──────────────────────────────────────────────────────

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto px-3 py-3 space-y-3 custom-scrollbar"
      style={{ minHeight: '100px' }}
    >
      {/* Error message */}
      {errorMessage && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-2.5 text-[11px] text-red-200">
          <strong>⚠️ Error:</strong> {errorMessage}
        </div>
      )}

      {/* Empty state with suggestions */}
      {messages.length === 0 && !errorMessage && !isStreaming && !isLoading && (
        <div className="flex flex-col items-center justify-center h-full text-center text-[#484f58]">
          <div className="w-12 h-12 rounded-full bg-violet-600/10 flex items-center justify-center mb-3">
            <Sparkles className="w-6 h-6 text-violet-400" />
          </div>
          <p className="text-[11px] font-medium text-[#8b949e]">AI Assistant Ready</p>
          <p className="text-[10px] mt-1 max-w-[200px]">
            Ask me to help you code, debug, or improve your project
          </p>
        </div>
      )}

      {/* Chat messages */}
      {messages.map((msg, index) => (
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
          role="assistant"
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

      {/* Scroll anchor */}
      <div ref={endRef} />
    </div>
  );
});

export default ChatMessages;
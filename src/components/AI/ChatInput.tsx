// src/components/AI/ChatInput.tsx
import { useState, useRef, useCallback, memo } from 'react';
import { Send } from 'lucide-react';

// ─── TYPES ───────────────────────────────────────────────────────────

export interface ChatInputProps {
  /** Called when a message is sent */
  onSend: (text: string) => void;
  /** Whether the AI is currently busy (loading or streaming) */
  isLoading: boolean;
  /** Optional placeholder text */
  placeholder?: string;
  /** Optional disabled state */
  disabled?: boolean;
}

// ─── COMPONENT ──────────────────────────────────────────────────────

export const ChatInput = memo(function ChatInput({
  onSend,
  isLoading,
  placeholder = 'Ask anything...',
  disabled = false,
}: ChatInputProps) {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const resize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, []);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setInput(e.target.value);
      requestAnimationFrame(resize);
    },
    [resize]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (input.trim() && !isLoading && !disabled) {
          onSend(input.trim());
          setInput('');
          requestAnimationFrame(() => {
            if (textareaRef.current) textareaRef.current.style.height = 'auto';
          });
        }
      }
    },
    [input, isLoading, disabled, onSend]
  );

  const handleClickSend = useCallback(() => {
    if (input.trim() && !isLoading && !disabled) {
      onSend(input.trim());
      setInput('');
      requestAnimationFrame(() => {
        if (textareaRef.current) textareaRef.current.style.height = 'auto';
      });
    }
  }, [input, isLoading, disabled, onSend]);

  const isDisabled = isLoading || disabled;

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={input}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        rows={1}
        placeholder={placeholder}
        className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg py-2 pl-3 pr-9 text-xs text-[#c9d1d9] resize-none focus:outline-none focus:border-[#58a6ff] focus:ring-1 focus:ring-[#58a6ff]/20 transition-all placeholder:text-[#484f58]"
        spellCheck={false}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        disabled={isDisabled}
      />
      <button
        onClick={handleClickSend}
        disabled={!input.trim() || isDisabled}
        className="absolute bottom-1.5 right-1.5 p-1 rounded-md bg-[#238636] hover:bg-[#2ea043] disabled:bg-[#30363d] disabled:opacity-50 transition-colors"
        aria-label="Send message"
      >
        <Send className="w-3 h-3 text-white" />
      </button>
    </div>
  );
});

export default ChatInput;
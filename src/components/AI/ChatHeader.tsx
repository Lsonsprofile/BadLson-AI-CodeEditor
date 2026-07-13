// src/components/AI/ChatHeader.tsx
import { memo } from 'react';
import {
  Sparkles,
  Trash2,
  Wifi,
  WifiOff,
  ChevronDown,
  Globe,
  Zap,
  Brain,
} from 'lucide-react';
import { type AiProviderKey } from '../../ai/providerConfig';

// ─── TYPES ───────────────────────────────────────────────────────────

export interface ChatHeaderProps {
  /** Current active provider key */
  provider: AiProviderKey;
  /** Currently open file name (if any) */
  activeFile: string | null;
  /** API connection status */
  apiStatus: 'online' | 'offline' | 'unknown';
  /** Number of messages in chat history */
  messageCount: number;
  /** Whether the provider dropdown is open */
  isDropdownOpen: boolean;
  /** Toggle the dropdown */
  onToggleDropdown: () => void;
  /** Switch to a different provider */
  onSwitchProvider: (provider: AiProviderKey) => void;
  /** Clear chat history */
  onClearChat: () => void;
}

// ─── COMPONENT ──────────────────────────────────────────────────────

export const ChatHeader = memo(function ChatHeader({
  provider,
  activeFile,
  apiStatus,
  messageCount,
  isDropdownOpen,
  onToggleDropdown,
  onSwitchProvider,
  onClearChat,
}: ChatHeaderProps) {
  // Provider configs (moved from the original)
  const providers: Record<AiProviderKey, { label: string; icon: typeof Globe; color: string; bg: string; border: string; desc: string }> = {
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

  const current = providers[provider];

  return (
    <div className="flex items-center justify-between px-3 py-2 bg-[#161b22] border-b border-[#21262d] shrink-0">
      <div className="flex items-center gap-2">
        {/* Logo */}
        <div className="w-6 h-6 rounded-lg bg-violet-600 flex items-center justify-center">
          <Sparkles className="w-3.5 h-3.5 text-white" />
        </div>
        <span className="text-xs font-semibold text-[#c9d1d9]">AI Assistant</span>

        {/* Provider Dropdown Toggle */}
        <div className="relative">
          <button
            onClick={onToggleDropdown}
            className={`flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full ${current.bg} ${current.color} border ${current.border} hover:brightness-110 transition-all`}
          >
            <current.icon className="w-2.5 h-2.5" />
            {current.label}
            <ChevronDown
              className={`w-2.5 h-2.5 transition-transform ${
                isDropdownOpen ? 'rotate-180' : ''
              }`}
            />
          </button>

          {/* Dropdown menu (rendered conditionally) */}
          {isDropdownOpen && (
            <div className="absolute top-full left-0 mt-1 w-40 bg-[#161b22] border border-[#30363d] rounded-lg shadow-xl z-50 overflow-hidden">
              {(Object.keys(providers) as AiProviderKey[]).map((key) => {
                const p = providers[key];
                const isActive = provider === key;
                return (
                  <button
                    key={key}
                    onClick={() => onSwitchProvider(key)}
                    className={`w-full flex items-center gap-2 px-2.5 py-2 text-left hover:bg-[#21262d] transition-colors ${
                      isActive ? 'bg-[#21262d]' : ''
                    }`}
                  >
                    <p.icon className={`w-3.5 h-3.5 ${p.color}`} />
                    <div className="flex flex-col">
                      <span className={`text-[10px] font-medium ${p.color}`}>
                        {p.label}
                        {isActive && (
                          <span className="text-[#8b949e] font-normal ml-1">(active)</span>
                        )}
                      </span>
                      <span className="text-[9px] text-[#484f58]">{p.desc}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Active file indicator */}
        {activeFile && (
          <span className="text-[9px] text-[#8b949e] truncate max-w-[80px]" title={activeFile}>
            {activeFile}
          </span>
        )}

        {/* Connection status */}
        {apiStatus === 'online' && (
          <Wifi className="w-3 h-3 text-emerald-400" aria-label="AI service online" />
        )}
        {apiStatus === 'offline' && (
          <WifiOff className="w-3 h-3 text-red-400" aria-label="AI service offline" />
        )}

        {/* Message count badge */}
        {messageCount > 0 && (
          <span className="text-[9px] text-[#8b949e] bg-[#21262d] px-1.5 py-0.5 rounded-full">
            {messageCount}
          </span>
        )}
      </div>

      {/* Clear button */}
      {messageCount > 0 && (
        <button
          onClick={onClearChat}
          className="p-1 text-[#8b949e] hover:text-[#f85149] hover:bg-[#21262d] rounded transition"
          aria-label="Clear chat history"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
});

export default ChatHeader;
// src/components/AI/ChatPanel.tsx
import { useState, memo } from 'react';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { useChat } from '../../hooks/useChat';
import { useApiHealth } from '../../hooks/useApiHealth';
import { PROVIDER_CONFIG } from '../../ai/providerConfig';
import { ChatHeader } from './ChatHeader';
import { EditStatusBar } from './EditStatusBar';
import { ChatMessages } from './ChatMessages';
import { ChatInput } from './ChatInput';

const MAX_MESSAGES = 20;

export default function ChatPanel() {
  // ─── STORE ──────────────────────────────────────────────────────────

  const {
    activeFile,
    chatHistory,
    clearChat,
    aiProvider,
    setAiProvider,
  } = useWorkspaceStore();

  // ─── LOCAL STATE ──────────────────────────────────────────────────

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // ─── API HEALTH ──────────────────────────────────────────────────

  const { status: apiStatus } = useApiHealth({
    pollingInterval: 30000,
    onStatusChange: (status) => {
      console.log(`[ChatPanel] API status changed to: ${status}`);
    },
  });

  // ─── CHAT HOOK ────────────────────────────────────────────────────

  const {
    send,
    isBusy,
    isLoading,
    isStreaming,
    streamingContent,
    errorMessage,
    appliedEdits,
    clearError,
  } = useChat({
    onError: (err) => {
      console.error('[ChatPanel] Chat error:', err);
    },
  });

  // ─── HANDLERS ──────────────────────────────────────────────────────

  const handleClear = () => {
    const count = chatHistory.length;
    if (count === 0) return;
    if (count > 5 && !window.confirm(`Clear all ${count} messages?`)) return;
    clearChat();
    clearError();
  };

  const handleProviderSwitch = (provider: typeof aiProvider.provider) => {
    setAiProvider({ provider });
    setIsDropdownOpen(false);
  };

  const toggleDropdown = () => setIsDropdownOpen((prev) => !prev);

  // ─── RENDER ──────────────────────────────────────────────────────

  const providerConfig = PROVIDER_CONFIG[aiProvider.provider];

  return (
    <div className="w-full h-full bg-[#0d1117] flex flex-col">
      {/* Header */}
      <ChatHeader
        provider={aiProvider.provider}
        activeFile={activeFile}
        apiStatus={apiStatus}
        messageCount={chatHistory.length}
        isDropdownOpen={isDropdownOpen}
        onToggleDropdown={toggleDropdown}
        onSwitchProvider={handleProviderSwitch}
        onClearChat={handleClear}
      />

      {/* Edit Status Bar */}
      <EditStatusBar
        edits={appliedEdits}
        onEditClick={(filename) => {
          // Optional: open the file in the editor
          console.log(`[ChatPanel] Clicked edit for: ${filename}`);
        }}
      />

      {/* Messages */}
      <ChatMessages
        messages={chatHistory}
        streamingContent={streamingContent}
        isStreaming={isStreaming}
        isLoading={isLoading}
        errorMessage={errorMessage}
        autoScroll
      />

      {/* Input Area */}
      <div className="p-2.5 bg-[#161b22] border-t border-[#21262d] shrink-0">
        <div className="flex items-center justify-between mb-1.5 px-1">
          <span
            className={`text-[9px] ${
              chatHistory.length >= MAX_MESSAGES ? 'text-[#f85149]' : 'text-[#484f58]'
            }`}
          >
            {chatHistory.length}/{MAX_MESSAGES} messages
          </span>
          <span className="text-[9px] text-[#484f58]">
            {isLoading
              ? `Sending via ${providerConfig.label}...`
              : isStreaming
              ? 'Streaming...'
              : 'Shift + Enter for new line'}
          </span>
        </div>

        <ChatInput onSend={send} isLoading={isBusy} />
      </div>
    </div>
  );
}
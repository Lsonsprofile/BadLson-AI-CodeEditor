// src/components/AI/ChatPanel.tsx
// ─────────────────────────────────────────────────────────────────────
// AI Chat Panel — Main chat interface with provider switching
// ─────────────────────────────────────────────────────────────────────

import { useState, memo } from 'react';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { useApiHealth } from '@/hooks/useApiHealth';
import { useAIStore, useAIStatus, useAITokenUsage, useAITruncated, useAIActions, useAIMessages } from '@/store/ai/aiStore';
import { PROVIDER_CONFIG } from '@/ai/providerConfig';
import { ChatHeader } from './ChatHeader';
import { EditStatusBar } from './EditStatusBar';
import { ChatMessages } from './ChatMessages';
import { ChatInput } from './ChatInput';

const MAX_MESSAGES = 20;

export default function ChatPanel() {
  // ─── STORE ──────────────────────────────────────────────────────────

  const {
    activeFile,
    clearChat,
    aiProvider,
    setAiProvider,
  } = useWorkspaceStore();

  // ✅ FIX: Use AI store messages, NOT workspace store chatHistory
  const messages = useAIMessages();

  // ─── LOCAL STATE ──────────────────────────────────────────────────

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // ─── API HEALTH ──────────────────────────────────────────────────

  const { status: apiStatus } = useApiHealth({
    pollingInterval: 30000,
    onStatusChange: (status) => {
      console.log(`[ChatPanel] API status changed to: ${status}`);
    },
  });

  // ─── AI STORE HOOKS ──────────────────────────────────────────────

  const aiStatus = useAIStatus();
  const tokenUsage = useAITokenUsage();
  const isTruncated = useAITruncated();
  const { sendMessage, stopGenerating } = useAIActions();
  const isLoading = useAIStore((state) => state.loading);
  const isTyping = useAIStore((state) => state.isTyping);
  const errorMessage = useAIStore((state) => state.lastError);
  const stream = useAIStore((state) => state.stream);

  const isBusy = isLoading || isTyping || stream.isStreaming;

  // ─── HANDLERS ──────────────────────────────────────────────────────

  const handleSend = async (message: string) => {
    try {
      await sendMessage(message);
    } catch (error) {
      // Error is already set in the store
      console.error('[ChatPanel] Send error:', error);
    }
  };

  const handleClear = () => {
    const count = messages.length;
    if (count === 0) return;
    if (count > 5 && !window.confirm(`Clear all ${count} messages?`)) return;
    clearChat();
    // Also clear AI store messages
    useAIStore.getState().clearMessages();
  };

  const handleProviderSwitch = (provider: typeof aiProvider.provider) => {
    setAiProvider({ provider });
    setIsDropdownOpen(false);
  };

  const toggleDropdown = () => setIsDropdownOpen((prev) => !prev);

  // ─── RENDER ──────────────────────────────────────────────────────

  const providerConfig = PROVIDER_CONFIG[aiProvider.provider];

  // Status display text
  const statusText = {
    idle: 'Ready',
    connecting: 'Connecting…',
    sending: 'Sending…',
    waiting: 'Waiting…',
    streaming: 'Streaming…',
    completed: 'Done',
    error: 'Error',
    cancelled: 'Cancelled',
    truncated: 'Truncated',
  }[aiStatus] || '';

  return (
    <div className="w-full h-full bg-[#0d1117] flex flex-col">
      {/* Header */}
      <ChatHeader
        provider={aiProvider.provider}
        activeFile={activeFile}
        apiStatus={apiStatus}
        messageCount={messages.length}
        isDropdownOpen={isDropdownOpen}
        onToggleDropdown={toggleDropdown}
        onSwitchProvider={handleProviderSwitch}
        onClearChat={handleClear}
      />

      {/* Edit Status Bar */}
      <EditStatusBar
        edits={[]}
        onEditClick={() => {}}
      />

      {/* Messages */}
      <ChatMessages
        messages={messages}
        streamingContent={stream.partialResponse}
        isStreaming={stream.isStreaming}
        isLoading={isLoading}
        errorMessage={errorMessage}
        autoScroll
      />

      {/* Token Usage & Truncation Warning */}
      <div className="px-3 py-1 bg-[#161b22] border-t border-[#21262d] shrink-0 flex flex-wrap items-center gap-2 text-[9px] text-[#484f58]">
        {tokenUsage && (
          <span>
            Tokens: {tokenUsage.promptTokens} → {tokenUsage.completionTokens} ({tokenUsage.totalTokens} total)
          </span>
        )}
        {isTruncated && (
          <span className="text-amber-400">⚠️ Response truncated – try splitting your request.</span>
        )}
        {aiStatus !== 'idle' && aiStatus !== 'completed' && aiStatus !== 'error' && (
          <span className="text-violet-400">{statusText}</span>
        )}
        {aiStatus === 'error' && errorMessage && (
          <span className="text-red-400">{errorMessage}</span>
        )}
        {isBusy && (
          <button
            onClick={stopGenerating}
            className="ml-auto px-2 py-0.5 bg-[#f85149]/20 text-[#f85149] rounded text-[9px] hover:bg-[#f85149]/30 transition"
          >
            Stop
          </button>
        )}
      </div>

      {/* Input Area */}
      <div className="p-2.5 bg-[#161b22] border-t border-[#21262d] shrink-0">
        <div className="flex items-center justify-between mb-1.5 px-1">
          <span
            className={`text-[9px] ${
              messages.length >= MAX_MESSAGES ? 'text-[#f85149]' : 'text-[#484f58]'
            }`}
          >
            {messages.length}/{MAX_MESSAGES} messages
          </span>
          <span className="text-[9px] text-[#484f58]">
            {isLoading
              ? `Sending via ${providerConfig.label}...`
              : stream.isStreaming
              ? 'Streaming...'
              : 'Shift + Enter for new line'}
          </span>
        </div>

        <ChatInput onSend={handleSend} isLoading={isBusy} />
      </div>
    </div>
  );
}
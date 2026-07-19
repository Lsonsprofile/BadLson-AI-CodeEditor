// src/components/AI/ChatPanel.tsx
// ─────────────────────────────────────────────────────────────────────
// AI Chat Panel — Smart edits, wireframes, file context, copy-paste
// ─────────────────────────────────────────────────────────────────────

import { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Send, Bot, User, Loader2, Sparkles, X, 
  Square, Copy, Check, Globe, Zap, Brain,
  ChevronDown, Code, Bug, Lightbulb, Wand2,
  CheckCircle2, XCircle, FileCode, Eye,
  Layout, FileEdit, RefreshCw, AlertTriangle
} from 'lucide-react';
import { useWorkspaceStore } from '@/store/workspaceStore';
import { useApiHealth } from '@/hooks/useApiHealth';
import { PROVIDER_CONFIG, type AiProviderKey } from '@/ai/providerConfig';

// ─── TYPES ──────────────────────────────────────────────────────────

interface AppliedEdit {
  filename: string;
  type: string;
  changes?: number;
}

interface FailedEdit {
  filename: string;
  reason: string;
}

interface WireframeData {
  title: string;
  content: string;
}

interface FileContextInfo {
  analyzed: boolean;
  fileCount: number;
  htmlAnalyzed: boolean;
}

interface ChatResponse {
  success: boolean;
  response: string;
  provider: string;
  model: string;
  mode: string;
  edits: {
    applied: AppliedEdit[];
    failed: FailedEdit[];
  };
  updatedFiles: Record<string, string>;
  wireframes?: WireframeData[];
  fileContext?: FileContextInfo;
  timestamp: string;
  error?: string;
}

interface EditNotification {
  id: string;
  filename: string;
  type: string;
  status: 'success' | 'failed';
  details?: string;
}

// ─── SUGGESTIONS ─────────────────────────────────────────────────────

const AI_SUGGESTIONS = [
  { icon: Wand2, text: 'Make the hero headline larger and purple', color: 'text-violet-400', mode: 'code' },
  { icon: Code, text: 'Add an interactive FAQ list with slide details', color: 'text-blue-400', mode: 'code' },
  { icon: Lightbulb, text: 'Add a dark/light mode toggle function', color: 'text-yellow-400', mode: 'code' },
  { icon: Bug, text: 'Fix any responsive issues in the CSS', color: 'text-red-400', mode: 'debug' },
  { icon: Layout, text: 'Create a wireframe for the dashboard', color: 'text-emerald-400', mode: 'wireframe' },
  { icon: Eye, text: 'Explain how the routing works', color: 'text-cyan-400', mode: 'explain' },
];

// ─── UTILITY: Generate unique ID ────────────────────────────────────

function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

// ─── CODE BLOCK RENDERER ────────────────────────────────────────────

function CodeBlock({ code, language }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Copy failed:', err);
    }
  };

  return (
    <div className="relative group my-2 rounded-lg overflow-hidden border border-[#1e293b] bg-[#0d1117]">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#161b22] border-b border-[#1e293b]">
        <span className="text-[10px] text-slate-500 font-mono">{language || 'code'}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-300 transition"
        >
          {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <pre className="p-3 overflow-x-auto text-[11px] font-mono text-slate-300 leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}

// ─── WIREFRAME RENDERER ─────────────────────────────────────────────

function WireframeBlock({ title, content }: WireframeData) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Copy failed:', err);
    }
  };

  return (
    <div className="my-3 rounded-lg overflow-hidden border border-emerald-500/30 bg-[#0d1117]">
      <div className="flex items-center justify-between px-3 py-2 bg-emerald-500/10 border-b border-emerald-500/20">
        <div className="flex items-center gap-2">
          <Layout className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-[11px] font-medium text-emerald-300">Wireframe: {title}</span>
        </div>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-[10px] text-emerald-400/70 hover:text-emerald-300 transition"
        >
          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <pre className="p-3 overflow-x-auto text-[10px] font-mono text-emerald-200/80 leading-tight whitespace-pre">
        {content}
      </pre>
    </div>
  );
}

// ─── MESSAGE CONTENT RENDERER ───────────────────────────────────────

function MessageContent({ content, wireframes }: { content: string; wireframes?: WireframeData[] }) {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;

  // Match code blocks
  const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      const textBefore = content.substring(lastIndex, match.index);
      parts.push(<MarkdownText key={`text-${lastIndex}`} text={textBefore} />);
    }

    const language = match[1];
    const code = match[2].trim();

    if (!language?.startsWith('edit:') && !language?.startsWith('patch:') && !language?.startsWith('wireframe:')) {
      parts.push(<CodeBlock key={`code-${match.index}`} code={code} language={language} />);
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    parts.push(<MarkdownText key={`text-${lastIndex}`} text={content.substring(lastIndex)} />);
  }

  return (
    <div className="space-y-1">
      {parts}
      {wireframes && wireframes.map((wf, idx) => (
        <WireframeBlock key={idx} title={wf.title} content={wf.content} />
      ))}
    </div>
  );
}

// ─── SIMPLE MARKDOWN TEXT RENDERER ──────────────────────────────────

function MarkdownText({ text }: { text: string }) {
  let rendered = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  rendered = rendered.replace(/\*(.*?)\*/g, '<em>$1</em>');
  rendered = rendered.replace(/`([^`]+)`/g, '<code class="px-1 py-0.5 bg-[#1a2035] rounded text-[11px] font-mono text-violet-300">$1</code>');
  rendered = rendered.replace(/\n/g, '<br/>');

  return <div className="text-sm text-slate-200 leading-relaxed" dangerouslySetInnerHTML={{ __html: rendered }} />;
}

// ─── MESSAGE METADATA STORE ────────────────────────────────────────

const messageMetadataStore = new Map<number, {
  provider?: string;
  model?: string;
  mode?: string;
  edits?: AppliedEdit[];
  failedEdits?: FailedEdit[];
  wireframes?: WireframeData[];
  fileContext?: FileContextInfo;
}>();

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
    openFiles,
    updateFile,
    openFile
  } = useWorkspaceStore();

  // ─── LOCAL STATE ──────────────────────────────────────────────────

  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [editNotifications, setEditNotifications] = useState<EditNotification[]>([]);
  const [showFileContext, setShowFileContext] = useState(false);
  const [lastContext, setLastContext] = useState<FileContextInfo | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // ─── API HEALTH ──────────────────────────────────────────────────

  const { status: apiStatus } = useApiHealth({
    pollingInterval: 30000,
    onStatusChange: (status: string) => {
      console.log(`[ChatPanel] API status: ${status}`);
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

  // ─── CLICK OUTSIDE DROPDOWN ──────────────────────────────────────

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ─── CLEAR NOTIFICATIONS ─────────────────────────────────────────

  useEffect(() => {
    if (editNotifications.length > 0) {
      const timer = setTimeout(() => {
        setEditNotifications([]);
      }, 10000);
      return () => clearTimeout(timer);
    }
  }, [editNotifications]);

  // ─── BUILD PROJECT FILES ─────────────────────────────────────────

  const buildProjectFiles = useCallback((): Record<string, string> => {
    const projectFiles: Record<string, string> = {};
    for (const [path, content] of Object.entries(files)) {
      if (content && typeof content === 'string' && content.trim()) {
        projectFiles[path] = content;
      }
    }
    return projectFiles;
  }, [files]);

  // ─── APPLY FILE UPDATES ──────────────────────────────────────────

  const applyFileUpdates = useCallback((updatedFiles: Record<string, string>) => {
    const notifications: EditNotification[] = [];
    
    for (const [path, content] of Object.entries(updatedFiles)) {
      if (typeof content !== 'string') continue;

      updateFile(path, content);
      
      if (!openFiles.includes(path)) {
        openFile(path);
      }

      notifications.push({
        id: generateId(),
        filename: path,
        type: 'updated',
        status: 'success',
        details: `${content.split('\n').length} lines`,
      });

      console.log(`✅ Applied update to: ${path}`);
    }

    if (notifications.length > 0) {
      setEditNotifications(prev => [...notifications, ...prev].slice(0, 10));
    }

    return notifications;
  }, [updateFile, openFile, openFiles]);

  // ─── PROCESS EDIT RESULTS ────────────────────────────────────────

  const processEditResults = useCallback((data: ChatResponse): string => {
    let responseMessage = data.response || '';
    const notifications: EditNotification[] = [];

    if (data.edits?.applied && data.edits.applied.length > 0) {
      const editDetails = data.edits.applied.map((e: AppliedEdit) => {
        let details = '';
        
        switch (e.type) {
          case 'created':
            details = 'New file created';
            break;
          case 'replaced':
            details = 'Full file replaced';
            break;
          case 'patched':
            details = 'Smart patch applied';
            break;
          case 'smart-merge':
            details = 'Changes merged';
            break;
          default:
            details = e.type || 'Updated';
        }
        
        notifications.push({
          id: generateId(),
          filename: e.filename,
          type: e.type,
          status: 'success',
          details,
        });
        
        return `✅ ${e.filename} — ${details}`;
      }).join('\n');
      
      if (editDetails) {
        responseMessage += `\n\n**✅ Applied Changes:**\n${editDetails}`;
      }
    }

    if (data.edits?.failed && data.edits.failed.length > 0) {
      const failedDetails = data.edits.failed.map((e: FailedEdit) => {
        notifications.push({
          id: generateId(),
          filename: e.filename,
          type: 'failed',
          status: 'failed',
          details: e.reason || 'Unknown error',
        });
        return `❌ ${e.filename}: ${e.reason || 'Unknown error'}`;
      }).join('\n');
      
      if (failedDetails) {
        responseMessage += `\n\n**⚠️ Failed to Apply:**\n${failedDetails}`;
      }
    }

    if (notifications.length > 0) {
      setEditNotifications(prev => [...notifications, ...prev].slice(0, 10));
    }

    return responseMessage;
  }, []);

  // ─── HANDLE SEND ──────────────────────────────────────────────────

  const handleSend = async () => {
    if (!input.trim() || isLoading || isAiTyping) return;

    const userMessage = input.trim();
    setInput('');
    setIsLoading(true);
    setErrorMessage(null);
    setEditNotifications([]);

    addChatMessage('user', userMessage);
    console.log('📤 Sending:', userMessage);

    try {
      setIsAiTyping(true);

      const projectFiles = buildProjectFiles();
      console.log(`📁 Sending ${Object.keys(projectFiles).length} files`);

      // ✅ FIXED: Use environment variable, NOT hardcoded localhost
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5002/api';
      console.log('🌐 Using API URL:', API_URL);

      const response = await fetch(`${API_URL}/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          projectFiles,
          chatHistory: chatHistory.slice(-10).map(msg => ({
            role: msg.role,
            content: msg.content,
          })),
          provider: aiProvider.provider || 'openrouter',
          activeFile: activeFile || null,
          recentFiles: openFiles.slice(-5),
          consoleErrors: [],
          buildErrors: [],
          selectedCode: null,
          cursorPosition: null,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `HTTP ${response.status}`);
      }

      const data = await response.json() as ChatResponse;
      console.log('📥 Response:', data);

      if (!data.success) {
        throw new Error(data.error || 'AI request failed');
      }

      // Apply file updates
      if (data.updatedFiles && Object.keys(data.updatedFiles).length > 0) {
        applyFileUpdates(data.updatedFiles);
      }

      // Process edit results and build response message
      const responseMessage = processEditResults(data);

      // Store file context info
      if (data.fileContext) {
        setLastContext(data.fileContext);
      }

      // Add AI response
      if (responseMessage) {
        addChatMessage('ai', responseMessage);
        
        // Store metadata
        const messageIndex = chatHistory.length;
        messageMetadataStore.set(messageIndex, {
          provider: data.provider,
          model: data.model,
          mode: data.mode,
          edits: data.edits?.applied,
          failedEdits: data.edits?.failed,
          wireframes: data.wireframes,
          fileContext: data.fileContext,
        });
        
        console.log('✅ AI response added');
      } else {
        throw new Error('No response from AI');
      }

    } catch (error) {
      console.error('❌ Error:', error);
      const msg = error instanceof Error ? error.message : 'Unknown error';
      setErrorMessage(msg);
      
      let errorResponse = `⚠️ **Error:** ${msg}`;
      if (msg.includes('timeout') || msg.includes('ECONNREFUSED')) {
        errorResponse += '\n\n💡 **Try:** Check if the backend server is running, or switch AI providers.';
      } else if (msg.includes('API key') || msg.includes('not_configured')) {
        errorResponse += '\n\n💡 **Try:** Add your API key or enable `MOCK_AI=true`.';
      } else if (msg.includes('too large') || msg.includes('MAX_TOTAL_CHARS')) {
        errorResponse += '\n\n💡 **Try:** Close some files or ask about a specific file.';
      }
      
      addChatMessage('ai', errorResponse);
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
    setEditNotifications([]);
    setLastContext(null);
    messageMetadataStore.clear();
  };

  // ─── HANDLE RETRY ─────────────────────────────────────────────────

  const handleRetry = () => {
    if (errorMessage) {
      setErrorMessage(null);
      const lastUserMsg = [...chatHistory].reverse().find(m => m.role === 'user');
      if (lastUserMsg) {
        setInput(lastUserMsg.content);
      }
    }
  };

  // ─── COPY MESSAGE CONTENT ────────────────────────────────────────

  const handleCopyMessage = useCallback((text: string) => {
    navigator.clipboard.writeText(text).catch(err => console.error('Copy failed:', err));
  }, []);

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
          {/* File Context Toggle */}
          {lastContext && (
            <button
              onClick={() => setShowFileContext(!showFileContext)}
              className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] transition ${
                showFileContext 
                  ? 'bg-indigo-500/20 text-indigo-400' 
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              <FileCode className="w-3 h-3" />
              {lastContext.fileCount} files
            </button>
          )}

          {/* Provider Dropdown */}
          <div className="relative" ref={dropdownRef}>
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
            title="Clear chat"
          >
            <X className="w-3.5 h-3.5 text-slate-400" />
          </button>
        </div>
      </div>

      {/* ─── FILE CONTEXT PANEL ───────────────────────────────────── */}
      {showFileContext && lastContext && (
        <div className="px-4 py-2 border-b border-[#1e293b] bg-[#0d1117] shrink-0">
          <div className="text-[10px] text-slate-400 space-y-1">
            <div className="flex items-center gap-2">
              <Eye className="w-3 h-3 text-indigo-400" />
              <span>AI analyzed <strong className="text-indigo-300">{lastContext.fileCount}</strong> files</span>
            </div>
            {lastContext.htmlAnalyzed && (
              <div className="flex items-center gap-2 text-emerald-400/70">
                <Layout className="w-3 h-3" />
                <span>HTML structure parsed (DOM, meta tags, sections)</span>
              </div>
            )}
            <div className="text-[9px] text-slate-500">
              The AI can read your file contents, understand imports, and suggest precise edits.
            </div>
          </div>
        </div>
      )}

      {/* ─── EDIT NOTIFICATIONS ───────────────────────────────────── */}
      {editNotifications.length > 0 && (
        <div className="px-4 py-2 border-b border-[#1e293b] bg-[#0d1117] shrink-0 space-y-1">
          <div className="text-[10px] font-medium text-slate-400 mb-1 flex items-center gap-1">
            <FileEdit className="w-3 h-3" />
            Applied Changes
          </div>
          {editNotifications.map((notif) => (
            <div key={notif.id} className="flex items-center gap-2 text-[10px] animate-in fade-in slide-in-from-top-1">
              {notif.status === 'success' ? (
                <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
              ) : (
                <XCircle className="w-3 h-3 text-red-400 shrink-0" />
              )}
              <span className={notif.status === 'success' ? 'text-emerald-300' : 'text-red-300'}>
                {notif.filename}
              </span>
              <span className="text-slate-500 text-[9px]">{notif.details}</span>
            </div>
          ))}
        </div>
      )}

      {/* ─── MESSAGES ────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
        {chatHistory.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Bot className="w-12 h-12 text-slate-600 mb-3" />
            <p className="text-sm text-slate-400">Start a conversation with the AI</p>
            <p className="text-[11px] text-slate-500 mt-1 max-w-[240px]">
              I can read your files, generate code, create wireframes, fix bugs, and edit specific lines
            </p>
            
            {/* Suggestions */}
            <div className="flex flex-wrap justify-center gap-2 mt-4 max-w-md">
              {AI_SUGGESTIONS.map((suggestion, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSuggestionClick(suggestion.text)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#1a2035] border border-[#1e293b] hover:border-indigo-500/50 transition text-[10px] text-slate-400 hover:text-slate-200"
                >
                  <suggestion.icon className={`w-3 h-3 ${suggestion.color}`} />
                  <span className="max-w-[140px] truncate">{suggestion.text}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {chatHistory.map((msg, index) => {
              const metadata = messageMetadataStore.get(index);
              
              return (
                <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[90%] rounded-lg px-4 py-3 ${
                    msg.role === 'user'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-[#1a2035] text-slate-200 border border-[#1e293b]'
                  }`}>
                    {/* Message header */}
                    <div className="flex items-center gap-2 mb-2">
                      {msg.role === 'user' ? (
                        <User className="w-3.5 h-3.5 opacity-70" />
                      ) : (
                        <Bot className="w-3.5 h-3.5 opacity-70" />
                      )}
                      <span className="text-[10px] opacity-70">
                        {msg.role === 'user' ? 'You' : 'AI Assistant'}
                      </span>
                      {metadata?.mode && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#0d1117] text-slate-500">
                          {metadata.mode}
                        </span>
                      )}
                      {msg.role === 'assistant' && (
                        <button
                          onClick={() => handleCopyMessage(msg.content)}
                          className="ml-auto opacity-40 hover:opacity-100 transition"
                          title="Copy message"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                      )}
                    </div>

                    {/* Message content */}
                    <MessageContent 
                      content={msg.content} 
                      wireframes={metadata?.wireframes} 
                    />

                    {/* Metadata footer */}
                    <div className="flex items-center gap-2 mt-2 pt-2 border-t border-[#1e293b]/50">
                      <span className="text-[9px] opacity-40">
                        {new Date(msg.timestamp).toLocaleTimeString()}
                      </span>
                      {metadata?.provider && (
                        <span className="text-[9px] opacity-30">
                          via {metadata.provider}
                        </span>
                      )}
                      {metadata?.model && (
                        <span className="text-[9px] opacity-30">
                          {metadata.model}
                        </span>
                      )}
                    </div>

                    {/* Edit summary */}
                    {metadata?.edits && metadata.edits.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-[#1e293b]/50">
                        <div className="text-[9px] text-emerald-400/70 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          Modified: {metadata.edits.map(e => e.filename).join(', ')}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            
            {/* Typing indicator */}
            {isAiTyping && (
              <div className="flex justify-start">
                <div className="bg-[#1a2035] text-slate-400 rounded-lg px-4 py-3 border border-[#1e293b]">
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-violet-400" />
                    <span className="text-sm">AI is analyzing your project...</span>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1">
                    Reading file structure, imports, and dependencies
                  </p>
                </div>
              </div>
            )}

            {/* Error with retry */}
            {errorMessage && (
              <div className="flex justify-center">
                <div className="bg-red-500/10 text-red-400 rounded-lg px-4 py-3 border border-red-500/20 text-sm max-w-[90%]">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="w-4 h-4" />
                    <span className="font-medium">Error</span>
                  </div>
                  <p className="text-xs leading-relaxed">{errorMessage}</p>
                  <button
                    onClick={handleRetry}
                    className="mt-2 flex items-center gap-1 text-[11px] text-red-300 hover:text-red-200 transition"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Retry
                  </button>
                </div>
              </div>
            )}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* ─── STATUS BAR ───────────────────────────────────────────── */}
      <div className="px-3 py-1.5 bg-[#0d1117] border-t border-[#1e293b] shrink-0 flex flex-wrap items-center gap-2 text-[9px] text-slate-500">
        {isBusy && (
          <span className="text-violet-400 flex items-center gap-1">
            <Loader2 className="w-3 h-3 animate-spin" />
            {isAiTyping ? 'AI is generating...' : 'Sending...'}
          </span>
        )}
        {lastContext && !isBusy && (
          <span className="text-slate-500 flex items-center gap-1">
            <Eye className="w-3 h-3" />
            Analyzed {lastContext.fileCount} files
          </span>
        )}
        {authUser ? (
          <span className="text-emerald-400/60 ml-auto">✓ Saved workspace</span>
        ) : (
          <span className="text-slate-500 ml-auto">💡 Login to save workspace</span>
        )}
        <span className="text-slate-600">
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
            placeholder="Ask me to code, fix, explain, or design..."
            disabled={isBusy}
            className="flex-1 rounded-md border border-[#1e293b] bg-[#111625] px-3 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-indigo-500 disabled:opacity-50 transition"
          />
          {isBusy ? (
            <button
              onClick={handleStop}
              className="rounded-md bg-red-600 px-3 py-2 text-white hover:bg-red-500 transition shrink-0"
              title="Stop generation"
            >
              <Square className="w-5 h-5" />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!input.trim() || isBusy}
              className="rounded-md bg-indigo-600 px-3 py-2 text-white hover:bg-indigo-500 transition disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
              title="Send message"
            >
              <Send className="w-5 h-5" />
            </button>
          )}
        </div>
        <div className="flex justify-between mt-1.5 px-1">
          <p className="text-[9px] text-slate-500">Shift + Enter for new line • AI reads your files automatically</p>
          <p className="text-[9px] text-slate-500">
            {isBusy ? '⏹️ Click stop to cancel' : `Using ${PROVIDER_CONFIG[aiProvider.provider as AiProviderKey]?.label || aiProvider.provider}`}
          </p>
        </div>
      </div>
    </div>
  );
}
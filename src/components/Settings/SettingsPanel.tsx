import { useState, useEffect } from 'react';
import {
  X,
  Type,
  Palette,
  Keyboard,
  Save,
  Bot,
  Zap,
  ShieldCheck,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { getAiModels, type AiModelsResponse } from '../../services/api';

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void}

export default function SettingsPanel({ isOpen, onClose }: SettingsPanelProps) {
  const { editorOptions, setEditorOptions, aiProvider, setAiProvider } = useWorkspaceStore();
  const [activeTab, setActiveTab] = useState('editor');

  // AI models state
  const [freeModels, setFreeModels] = useState<string[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  useEffect(() => {
    if (activeTab === 'ai' && freeModels.length === 0) {
      refreshModels();
    }
  }, [activeTab]);

  const refreshModels = async () => {
    setModelsLoading(true);
    setModelsError(null);
    try {
      const res: AiModelsResponse = await getAiModels();
      if (res.success && res.data.openrouter.freeModels) {
        setFreeModels(res.data.openrouter.freeModels);
        setLastRefreshed(new Date());
      } else {
        setModelsError('Could not fetch models from server');
      }
    } catch (err) {
      setModelsError(err instanceof Error ? err.message : 'Failed to fetch models');
    } finally {
      setModelsLoading(false);
    }
  };

  if (!isOpen) return null;

  const tabs = [
    { id: 'editor', label: 'Editor', icon: Type },
    { id: 'appearance', label: 'Appearance', icon: Palette },
    { id: 'ai', label: 'AI Provider', icon: Bot },
    { id: 'shortcuts', label: 'Shortcuts', icon: Keyboard },
  ];

  const providers = [
    {
      id: 'openrouter' as const,
      label: 'OpenRouter',
      subtitle: 'Free models with auto-rotation',
      color: 'text-emerald-400',
      borderColor: 'border-emerald-500',
      bgColor: 'bg-emerald-500/10',
    },
    {
      id: 'groq' as const,
      label: 'Groq',
      subtitle: 'Fast inference, limited free tier',
      color: 'text-amber-400',
      borderColor: 'border-amber-500',
      bgColor: 'bg-amber-500/10',
    },
    {
      id: 'gemini' as const,
      label: 'Gemini',
      subtitle: 'Google AI with free tier',
      color: 'text-blue-400',
      borderColor: 'border-blue-500',
      bgColor: 'bg-blue-500/10',
    },
  ];

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-[#111625] border border-[#1e293b] rounded-lg shadow-2xl w-[520px] max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#1e293b]">
          <h2 className="text-sm font-semibold text-white">Settings</h2>
          <button onClick={onClose} className="p-1 hover:bg-[#1a2035] rounded transition">
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[#1e293b]">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-2 text-[11px] transition ${
                activeTab === tab.id
                  ? 'text-indigo-400 border-b-2 border-indigo-500 bg-[#161d30]'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-[#161d30]'
              }`}
            >
              <tab.icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* ─── EDITOR TAB ─── */}
          {activeTab === 'editor' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-[11px] font-medium text-slate-200">Font Size</label>
                  <p className="text-[10px] text-slate-500">Editor font size in pixels</p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={editorOptions.fontSize}
                    onChange={(e) => setEditorOptions({ fontSize: parseInt(e.target.value) || 13 })}
                    className="w-16 bg-[#161d30] border border-[#1e293b] rounded px-2 py-1 text-[11px] text-slate-200 outline-none focus:border-indigo-500"
                    min={8}
                    max={32}
                  />
                  <span className="text-[10px] text-slate-500">px</span>
                </div>
              </div>

              <div className="h-px bg-[#1e293b]" />

              <div className="flex items-center justify-between">
                <div>
                  <label className="text-[11px] font-medium text-slate-200">Tab Size</label>
                  <p className="text-[10px] text-slate-500">Number of spaces per tab</p>
                </div>
                <select
                  value={editorOptions.tabSize}
                  onChange={(e) => setEditorOptions({ tabSize: parseInt(e.target.value) })}
                  className="bg-[#161d30] border border-[#1e293b] rounded px-2 py-1 text-[11px] text-slate-200 outline-none focus:border-indigo-500"
                >
                  <option value={2}>2 spaces</option>
                  <option value={4}>4 spaces</option>
                </select>
              </div>

              <div className="h-px bg-[#1e293b]" />

              <div className="flex items-center justify-between">
                <div>
                  <label className="text-[11px] font-medium text-slate-200">Word Wrap</label>
                  <p className="text-[10px] text-slate-500">Wrap lines to viewport width</p>
                </div>
                <button
                  onClick={() => setEditorOptions({ wordWrap: !editorOptions.wordWrap })}
                  className={`w-10 h-5 rounded-full transition ${editorOptions.wordWrap ? 'bg-indigo-500' : 'bg-slate-700'}`}
                >
                  <div className={`w-4 h-4 bg-white rounded-full transition-transform ${editorOptions.wordWrap ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </button>
              </div>

              <div className="h-px bg-[#1e293b]" />

              <div className="flex items-center justify-between">
                <div>
                  <label className="text-[11px] font-medium text-slate-200">Line Numbers</label>
                  <p className="text-[10px] text-slate-500">Show line numbers in editor</p>
                </div>
                <button
                  onClick={() => setEditorOptions({ lineNumbers: !editorOptions.lineNumbers })}
                  className={`w-10 h-5 rounded-full transition ${editorOptions.lineNumbers ? 'bg-indigo-500' : 'bg-slate-700'}`}
                >
                  <div className={`w-4 h-4 bg-white rounded-full transition-transform ${editorOptions.lineNumbers ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </button>
              </div>
            </div>
          )}

          {/* ─── APPEARANCE TAB ─── */}
          {activeTab === 'appearance' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-[11px] font-medium text-slate-200">Minimap</label>
                  <p className="text-[10px] text-slate-500">Show code minimap</p>
                </div>
                <button
                  onClick={() => setEditorOptions({ minimap: !editorOptions.minimap })}
                  className={`w-10 h-5 rounded-full transition ${editorOptions.minimap ? 'bg-indigo-500' : 'bg-slate-700'}`}
                >
                  <div className={`w-4 h-4 bg-white rounded-full transition-transform ${editorOptions.minimap ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </button>
              </div>

              <div className="h-px bg-[#1e293b]" />

              <div>
                <label className="text-[11px] font-medium text-slate-200 mb-2 block">Theme</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { key: 'vs-dark', label: 'Dark' },
                    { key: 'vs-light', label: 'Light' },
                    { key: 'hc-black', label: 'High Contrast' },
                    { key: 'hc-light', label: 'High Contrast Light' },
                    { key: 'vs', label: 'Classic' },
                  ].map((theme) => (
                    <button
                      key={theme.key}
                      onClick={() => setEditorOptions({ theme: theme.key })}
                      className={`px-3 py-2 rounded-md text-[10px] border transition ${
                        editorOptions.theme === theme.key
                          ? 'border-indigo-500 bg-indigo-500/10 text-indigo-400'
                          : 'border-[#1e293b] text-slate-400 hover:border-[#334155]'
                      }`}
                    >
                      {theme.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ─── AI PROVIDER TAB ─── */}
          {activeTab === 'ai' && (
            <div className="space-y-5">
              {/* Provider Selection */}
              <div>
                <label className="text-[11px] font-medium text-slate-200 mb-2 block">
                  AI Provider
                </label>
                <div className="space-y-2">
                  {providers.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setAiProvider({ provider: p.id })}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border transition text-left ${
                        aiProvider.provider === p.id
                          ? `${p.borderColor} ${p.bgColor}`
                          : 'border-[#1e293b] hover:border-[#334155]'
                      }`}
                    >
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                        aiProvider.provider === p.id ? p.borderColor : 'border-slate-600'
                      }`}>
                        {aiProvider.provider === p.id && (
                          <div className={`w-2 h-2 rounded-full ${p.color.replace('text-', 'bg-')}`} />
                        )}
                      </div>
                      <div className="flex-1">
                        <div className={`text-[11px] font-medium ${aiProvider.provider === p.id ? p.color : 'text-slate-300'}`}>
                          {p.label}
                        </div>
                        <div className="text-[10px] text-slate-500">{p.subtitle}</div>
                      </div>
                      {aiProvider.provider === p.id && (
                        <Zap className={`w-3.5 h-3.5 ${p.color}`} />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <div className="h-px bg-[#1e293b]" />

              {/* OpenRouter Model Selection */}
              {aiProvider.provider === 'openrouter' && (
                <>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-[11px] font-medium text-slate-200">
                        Preferred Free Model
                      </label>
                      <button
                        onClick={refreshModels}
                        disabled={modelsLoading}
                        className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-indigo-400 transition disabled:opacity-50"
                      >
                        <RefreshCw className={`w-3 h-3 ${modelsLoading ? 'animate-spin' : ''}`} />
                        Refresh
                      </button>
                    </div>

                    {modelsError && (
                      <div className="flex items-center gap-1.5 mb-2 px-2 py-1.5 bg-red-500/10 border border-red-500/20 rounded text-[10px] text-red-400">
                        <AlertCircle className="w-3 h-3" />
                        {modelsError}
                      </div>
                    )}

                    <select
                      value={aiProvider.preferredOpenRouterModel || ''}
                      onChange={(e) => setAiProvider({ preferredOpenRouterModel: e.target.value || null })}
                      className="w-full bg-[#161d30] border border-[#1e293b] rounded px-2 py-1.5 text-[11px] text-slate-200 outline-none focus:border-indigo-500 mb-2"
                    >
                      <option value="">Auto-rotate (recommended)</option>
                      {freeModels.map((model) => (
                        <option key={model} value={model}>
                          {model}
                        </option>
                      ))}
                    </select>

                    {freeModels.length > 0 && (
                      <p className="text-[10px] text-slate-500">
                        {freeModels.length} free models available
                        {lastRefreshed && ` · Updated ${lastRefreshed.toLocaleTimeString()}`}
                      </p>
                    )}

                    {modelsLoading && (
                      <p className="text-[10px] text-slate-500 animate-pulse">Fetching latest models...</p>
                    )}
                  </div>

                  <div className="h-px bg-[#1e293b]" />
                </>
              )}

              {/* Fallback Toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-[11px] font-medium text-slate-200 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                    Auto-Fallback
                  </label>
                  <p className="text-[10px] text-slate-500">
                    If {aiProvider.provider} fails, automatically try the next provider
                  </p>
                </div>
                <button
                  onClick={() => setAiProvider({ fallbackEnabled: !aiProvider.fallbackEnabled })}
                  className={`w-10 h-5 rounded-full transition ${aiProvider.fallbackEnabled ? 'bg-emerald-500' : 'bg-slate-700'}`}
                >
                  <div className={`w-4 h-4 bg-white rounded-full transition-transform ${aiProvider.fallbackEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </button>
              </div>

              {/* Status Summary */}
              <div className="bg-[#0d1117] border border-[#1e293b] rounded-lg p-3 space-y-2">
                <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Current Setup</div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-slate-300">Primary</span>
                    <span className={`text-[11px] font-medium ${
                      aiProvider.provider === 'openrouter' ? 'text-emerald-400' :
                      aiProvider.provider === 'groq' ? 'text-amber-400' : 'text-blue-400'
                    }`}>
                      {providers.find(p => p.id === aiProvider.provider)?.label}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-slate-300">Fallback</span>
                    <span className={`text-[11px] ${aiProvider.fallbackEnabled ? 'text-emerald-400' : 'text-slate-500'}`}>
                      {aiProvider.fallbackEnabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                  {aiProvider.provider === 'openrouter' && (
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-slate-300">Model Strategy</span>
                      <span className="text-[11px] text-slate-400 truncate max-w-[200px]">
                        {aiProvider.preferredOpenRouterModel || 'Auto-rotate free models'}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ─── SHORTCUTS TAB ─── */}
          {activeTab === 'shortcuts' && (
            <div className="space-y-2">
              {[
                { key: 'Ctrl + S', action: 'Save files' },
                { key: 'Ctrl + F', action: 'Find in file' },
                { key: 'Ctrl + H', action: 'Replace' },
                { key: 'Ctrl + /', action: 'Toggle comment' },
                { key: 'Ctrl + Z', action: 'Undo' },
                { key: 'Ctrl + Shift + Z', action: 'Redo' },
                { key: 'Ctrl + D', action: 'Select next occurrence' },
                { key: 'Alt + Up/Down', action: 'Move line' },
                { key: 'Ctrl + Shift + F', action: 'Format code' },
              ].map((shortcut, index) => (
                <div key={index} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-[#161d30] transition">
                  <span className="text-[11px] text-slate-300">{shortcut.action}</span>
                  <kbd className="px-2 py-0.5 bg-[#161d30] border border-[#1e293b] rounded text-[10px] text-slate-400 code-font">
                    {shortcut.key}
                  </kbd>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-[#1e293b]">
          <button onClick={onClose} className="px-3 py-1.5 text-[11px] text-slate-400 hover:text-slate-200 transition">
            Cancel
          </button>
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] rounded-md transition"
          >
            <Save className="w-3 h-3" />
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}
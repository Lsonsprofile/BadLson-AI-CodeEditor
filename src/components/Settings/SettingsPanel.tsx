import { useState } from 'react';
import {
  X,
  Type,
  Palette,
  Keyboard,
  Save,
} from 'lucide-react';
import { useWorkspaceStore } from '../../store/workspaceStore';

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SettingsPanel({ isOpen, onClose }: SettingsPanelProps) {
  const { editorOptions, setEditorOptions } = useWorkspaceStore();
  const [activeTab, setActiveTab] = useState('editor');

  if (!isOpen) return null;

  const tabs = [
    { id: 'editor', label: 'Editor', icon: Type },
    { id: 'appearance', label: 'Appearance', icon: Palette },
    { id: 'shortcuts', label: 'Shortcuts', icon: Keyboard },
  ];

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-[#111625] border border-[#1e293b] rounded-lg shadow-2xl w-[480px] max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#1e293b]">
          <h2 className="text-sm font-semibold text-white">Settings</h2>
          <button onClick={onClose} className="p-1 hover:bg-[#1a2035] rounded transition">
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>

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

        <div className="flex-1 overflow-y-auto p-4">
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

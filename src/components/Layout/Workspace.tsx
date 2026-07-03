import { useState, useCallback, useEffect } from 'react';
import { useWorkspaceStore } from '../../store/workspaceStore';
import EditorTabs from '../Editor/EditorTabs';
import MonacoEditorComponent from '../Editor/MonacoEditor';
import LivePreview from '../Preview/LivePreview';

export default function Workspace() {
  const { sidebarVisible, activeFile } = useWorkspaceStore();
  const [editorHeight, setEditorHeight] = useState(20);
  const [isDragging, setIsDragging] = useState(false);

  const handleMouseDown = useCallback(() => {
    setIsDragging(true);
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const container = document.getElementById('workspace-main');
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const percentage = ((e.clientY - rect.top) / rect.height) * 100;
      setEditorHeight(Math.max(20, Math.min(80, percentage)));
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isDragging]);

  return (
    <div id="workspace-main" className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <EditorTabs />

        <div className="flex-1 flex flex-col min-h-0">
          <div
            className="flex-none flex flex-col overflow-hidden min-h-[120px]"
            style={{ flexBasis: `${editorHeight}%` }}
          >
            <div className="panel-header">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-semibold text-slate-300">{activeFile}</span>
                <span className="text-[9px] text-slate-600 code-font">
                  {activeFile.endsWith('.html') && 'HTML'}
                  {activeFile.endsWith('.css') && 'CSS'}
                  {activeFile.endsWith('.js') && 'JavaScript'}
                </span>
              </div>
              <span className="text-[9px] text-slate-600">Editing</span>
            </div>

            <MonacoEditorComponent />
          </div>

          <div
            onMouseDown={handleMouseDown}
            className="resizer-v h-2.5 shrink-0"
          />

          <div className="flex-1 min-h-0 h-full overflow-hidden">
            <LivePreview />
          </div>
        </div>
      </div>
    </div>
  );
}

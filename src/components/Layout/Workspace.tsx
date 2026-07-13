import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useWorkspaceStore } from '../../store/workspaceStore';
import EditorTabs from '../Editor/EditorTabs';
import MonacoEditorComponent from '../Editor/MonacoEditor';
import LivePreview from '../Preview/LivePreview';
import { getFileLanguage } from '../../utils/formatter';

const MIN_EDITOR_HEIGHT = 20;
const MAX_EDITOR_HEIGHT = 80;
const MIN_EDITOR_PANEL_HEIGHT = 120;

export default function Workspace() {
  const { activeFile } = useWorkspaceStore();

  const workspaceRef = useRef<HTMLDivElement>(null);

  const [editorHeight, setEditorHeight] = useState(50);
  const [isDragging, setIsDragging] = useState(false);

  const language = useMemo(() => {
    if (!activeFile) return 'Plain Text';

    try {
      return getFileLanguage(activeFile);
    } catch {
      return 'Plain Text';
    }
  }, [activeFile]);

  const handlePointerDown = useCallback(() => {
    setIsDragging(true);
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const handlePointerMove = (event: PointerEvent) => {
      const container = workspaceRef.current;

      if (!container) return;

      const rect = container.getBoundingClientRect();

      if (rect.height <= 0) return;

      const percentage =
        ((event.clientY - rect.top) / rect.height) * 100;

      const clampedPercentage = Math.min(
        MAX_EDITOR_HEIGHT,
        Math.max(MIN_EDITOR_HEIGHT, percentage)
      );

      setEditorHeight(clampedPercentage);
    };

    const handlePointerUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);

    document.body.classList.add('resizing');

    return () => {
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);

      document.body.classList.remove('resizing');
    };
  }, [isDragging]);

  return (
    <div
      id="workspace-main"
      ref={workspaceRef}
      className="flex flex-1 flex-col min-h-0 overflow-hidden"
    >
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <EditorTabs />

        <div className="flex flex-1 flex-col min-h-0">
          <div
            className="flex-none flex flex-col overflow-hidden"
            style={{
              flexBasis: `${editorHeight}%`,
              minHeight: `${MIN_EDITOR_PANEL_HEIGHT}px`,
            }}
          >
            <div className="panel-header">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-semibold text-slate-300">
                  {activeFile || 'Untitled'}
                </span>

                <span className="code-font text-[9px] text-slate-500">
                  {language}
                </span>
              </div>

              <span className="text-[9px] text-slate-600">
                Editing
              </span>
            </div>

            <MonacoEditorComponent />
          </div>

          <div
            role="separator"
            aria-label="Resize editor and preview panels"
            aria-orientation="horizontal"
            tabIndex={0}
            onPointerDown={handlePointerDown}
            className="resizer-v h-2.5 shrink-0"
          />

          <div className="flex-1 min-h-0 overflow-hidden">
            <LivePreview />
          </div>
        </div>
      </div>
    </div>
  );
}
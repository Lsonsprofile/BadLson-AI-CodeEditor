// src/components/AI/EditStatusBar.tsx
import { memo } from 'react';
import { CheckCircle2, XCircle, FileEdit } from 'lucide-react';

// ─── TYPES ───────────────────────────────────────────────────────────

export interface EditNotification {
  filename: string;
  type: 'created' | 'replaced' | 'appended' | 'unchanged';
  status: 'success' | 'failed';
}

export interface EditStatusBarProps {
  /** List of edit notifications to display */
  edits: EditNotification[];
  /** Optional: maximum number of items to show at once */
  maxItems?: number;
  /** Optional: auto-dismiss timeout in milliseconds */
  autoDismissMs?: number;
  /** Optional: callback when an edit is clicked */
  onEditClick?: (filename: string) => void;
}

// ─── COMPONENT ──────────────────────────────────────────────────────

export const EditStatusBar = memo(function EditStatusBar({
  edits,
  maxItems = 5,
  onEditClick,
}: EditStatusBarProps) {
  if (edits.length === 0) return null;

  const displayEdits = edits.slice(0, maxItems);
  const remaining = edits.length - maxItems;

  return (
    <div className="px-3 py-2 bg-[#161b22] border-b border-[#21262d] space-y-1 shrink-0">
      {/* Header */}
      <div className="text-[9px] text-[#8b949e] uppercase tracking-wider font-medium mb-1">
        Applied Changes
      </div>

      {/* Edit items */}
      {displayEdits.map((edit, index) => (
        <button
          key={`${edit.filename}-${index}`}
          onClick={() => onEditClick?.(edit.filename)}
          className="w-full flex items-center gap-1.5 text-[10px] hover:bg-[#21262d] rounded px-1 py-0.5 transition-colors text-left"
        >
          {/* Status icon */}
          {edit.status === 'success' ? (
            <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
          ) : (
            <XCircle className="w-3 h-3 text-red-400 shrink-0" />
          )}

          {/* File icon */}
          <FileEdit className="w-3 h-3 text-[#58a6ff] shrink-0" />

          {/* Filename */}
          <span
            className={`truncate ${
              edit.status === 'success' ? 'text-emerald-300' : 'text-red-300'
            }`}
          >
            {edit.filename}
          </span>

          {/* Type badge */}
          <span className="text-[#484f58] ml-auto shrink-0">
            {edit.type}
          </span>
        </button>
      ))}

      {/* "More" indicator */}
      {remaining > 0 && (
        <div className="text-[9px] text-[#484f58] text-center pt-0.5">
          +{remaining} more {remaining === 1 ? 'change' : 'changes'}
        </div>
      )}
    </div>
  );
});

export default EditStatusBar;
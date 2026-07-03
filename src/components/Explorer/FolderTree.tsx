import { useState } from 'react';
import { Folder, ChevronRight, ChevronDown, FileText } from 'lucide-react';

interface FolderItem {
  name: string;
  type: 'folder' | 'file';
  items?: FolderItem[];
}

interface FolderNodeProps {
  name: string;
  items: FolderItem[];
  depth?: number;
  onFileSelect?: (name: string) => void;
}

function FolderNode({ name, items, depth = 0, onFileSelect }: FolderNodeProps) {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 w-full px-2 py-1 text-[11px] text-slate-400 hover:text-slate-200 hover:bg-[#1a2035] rounded-sm transition-colors"
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        {isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        <Folder className="w-3.5 h-3.5 text-yellow-500/70" />
        <span className="truncate">{name}</span>
      </button>
      {isOpen && (
        <div>
          {items.map((item, index) =>
            item.type === 'folder' ? (
              <FolderNode
                key={index}
                name={item.name}
                items={item.items || []}
                depth={depth + 1}
                onFileSelect={onFileSelect}
              />
            ) : (
              <button
                key={index}
                onClick={() => onFileSelect?.(item.name)}
                className="flex items-center gap-2 w-full px-2 py-1 text-[11px] text-slate-400 hover:text-slate-200 hover:bg-[#1a2035] rounded-sm transition-colors"
                style={{ paddingLeft: `${(depth + 1) * 12 + 20}px` }}
              >
                <FileText className="w-3.5 h-3.5 text-slate-500" />
                <span className="truncate">{item.name}</span>
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}

interface FolderTreeProps {
  structure: FolderItem[];
  onFileSelect?: (name: string) => void;
}

export default function FolderTree({ structure, onFileSelect }: FolderTreeProps) {
  return (
    <div className="h-full overflow-y-auto">
      {structure.map((item, index) =>
        item.type === 'folder' ? (
          <FolderNode key={index} name={item.name} items={item.items || []} onFileSelect={onFileSelect} />
        ) : (
          <button
            key={index}
            onClick={() => onFileSelect?.(item.name)}
            className="flex items-center gap-2 w-full px-2 py-1 text-[11px] text-slate-400 hover:text-slate-200 hover:bg-[#1a2035] rounded-sm transition-colors"
          >
            <FileText className="w-3.5 h-3.5 text-slate-500" />
            <span>{item.name}</span>
          </button>
        )
      )}
    </div>
  );
}

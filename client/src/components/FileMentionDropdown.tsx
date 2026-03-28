import { useState, useEffect, useRef, useCallback } from 'react';
import { File, Folder } from 'lucide-react';
import { searchProjectFiles } from '../api';

interface FileMentionDropdownProps {
  query: string;
  projectPath: string;
  visible: boolean;
  selectedIndex: number;
  onSelect: (filePath: string) => void;
  onClose: () => void;
  onFilesChange: (files: string[]) => void;
}

export function FileMentionDropdown({
  query,
  projectPath,
  visible,
  selectedIndex,
  onSelect,
  onClose,
  onFilesChange,
}: FileMentionDropdownProps) {
  const [files, setFiles] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const fetchFiles = useCallback(async (q: string) => {
    if (!projectPath) return;
    setLoading(true);
    try {
      const results = await searchProjectFiles(projectPath, q || undefined);
      setFiles(results);
      onFilesChange(results);
    } catch {
      setFiles([]);
      onFilesChange([]);
    } finally {
      setLoading(false);
    }
  }, [projectPath, onFilesChange]);

  useEffect(() => {
    if (!visible) return;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchFiles(query), query ? 100 : 0);
    return () => clearTimeout(debounceRef.current);
  }, [query, visible, fetchFiles]);

  // Reset files when hidden
  useEffect(() => {
    if (!visible) {
      setFiles([]);
      onFilesChange([]);
    }
  }, [visible, onFilesChange]);

  // Scroll selected item into view
  useEffect(() => {
    if (!visible || !containerRef.current) return;
    const item = containerRef.current.children[selectedIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex, visible]);

  if (!visible || !projectPath) return null;

  return (
    <div
      ref={containerRef}
      className="absolute bottom-full left-0 right-0 z-[500] max-h-56 overflow-y-auto border border-zinc-600 bg-black/95 backdrop-blur-sm shadow-lg"
    >
      {loading && files.length === 0 && (
        <div className="px-3 py-2 text-xs text-zinc-500">searching...</div>
      )}
      {!loading && files.length === 0 && (
        <div className="px-3 py-2 text-xs text-zinc-500">no files found</div>
      )}
      {files.map((file, i) => {
        const dir = file.includes('/') ? file.substring(0, file.lastIndexOf('/') + 1) : '';
        const name = file.includes('/') ? file.substring(file.lastIndexOf('/') + 1) : file;
        return (
          <div
            key={file}
            className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer text-sm ${
              i === selectedIndex
                ? 'bg-zinc-700/80 text-zinc-100'
                : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200'
            }`}
            onMouseDown={(e) => {
              e.preventDefault();
              onSelect(file);
            }}
            onClick={() => onSelect(file)}
          >
            {file.includes('/') ? (
              <Folder className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
            ) : (
              <File className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
            )}
            <span className="truncate">
              {dir && <span className="text-zinc-600">{dir}</span>}
              <span>{name}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * File-handling UI: drop zone, file cards, batch queue, before/after compare
 * and the sticky bottom action bar used by every file-based tool.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
} from 'react';
import { FileText, FolderOpen, Upload, X } from 'lucide-react';
import { filesFromDataTransfer, filterByAccept } from '../core/files';
import { fileKindLabel, formatBytes, truncateMiddle } from '../core/format';
import { Badge, Button, Notice } from './ui';

export type FileStatus = 'ready' | 'processing' | 'done' | 'error';

export interface QueuedFile {
  id: string;
  file: File;
  /** Object URL for the original file — usable as an <img> source. */
  previewUrl: string | null;
  kind: string;
  status: FileStatus;
  message?: string;
}

let queueCounter = 0;
const nextId = () => `qf_${Date.now().toString(36)}_${(queueCounter += 1)}`;

export interface FileQueue {
  items: QueuedFile[];
  add: (input: FileList | File[] | null | undefined) => { added: number; rejected: string[] };
  remove: (id: string) => void;
  clear: () => void;
  setStatus: (id: string, status: FileStatus, message?: string) => void;
  setAllStatus: (status: FileStatus, message?: string) => void;
  isImageQueue: boolean;
}

/**
 * Central queue for file-based tools: drag & drop, click-to-browse, multiple
 * files, previews and per-item status.
 */
export function useFileQueue(options?: { accept?: string; maxFiles?: number }): FileQueue {
  const accept = options?.accept;
  const maxFiles = options?.maxFiles ?? 200;
  const [items, setItems] = useState<QueuedFile[]>([]);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  useEffect(
    () => () => {
      for (const item of itemsRef.current) {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      }
    },
    [],
  );

  const add = useCallback(
    (input: FileList | File[] | null | undefined) => {
      const incoming = input ? Array.from(input) : [];
      if (!incoming.length) return { added: 0, rejected: [] };

      const { accepted, rejected } = filterByAccept(incoming, accept);
      const next: QueuedFile[] = [];

      setItems((prev) => {
        const room = Math.max(0, maxFiles - prev.length);
        for (const file of accepted.slice(0, room)) {
          next.push({
            id: nextId(),
            file,
            previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
            kind: fileKindLabel(file.type, file.name),
            status: 'ready',
          });
        }
        return [...prev, ...next];
      });

      return {
        added: next.length,
        rejected: rejected.map((file) => file.name),
      };
    },
    [accept, maxFiles],
  );

  const remove = useCallback((id: string) => {
    setItems((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((item) => item.id !== id);
    });
  }, []);

  const clear = useCallback(() => {
    setItems((prev) => {
      for (const item of prev) {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      }
      return [];
    });
  }, []);

  const setStatus = useCallback((id: string, status: FileStatus, message?: string) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, status, message: message ?? item.message } : item)),
    );
  }, []);

  const setAllStatus = useCallback((status: FileStatus, message?: string) => {
    setItems((prev) => prev.map((item) => ({ ...item, status, message })));
  }, []);

  const isImageQueue = useMemo(
    () => items.length > 0 && items.every((item) => item.file.type.startsWith('image/')),
    [items],
  );

  return { items, add, remove, clear, setStatus, setAllStatus, isImageQueue };
}

/* ==========================================================================
   Drop zone
   ========================================================================== */

export function DropZone({
  onFiles,
  accept,
  multiple = true,
  title = 'Drop files here',
  hint = 'or click to browse — drag & drop works too',
  formats,
  size = 'md',
  icon,
  disabled = false,
  compactLabel,
}: {
  onFiles: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
  title?: ReactNode;
  hint?: ReactNode;
  formats?: string[];
  size?: 'sm' | 'md' | 'lg';
  icon?: ReactNode;
  disabled?: boolean;
  compactLabel?: string;
}) {
  const [dragging, setDragging] = useState(false);
  const [rejections, setRejections] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);

  const handleFiles = useCallback(
    (files: File[]) => {
      if (!files.length) return;
      const { accepted, rejected } = filterByAccept(files, accept);
      setRejections(rejected.map((file) => file.name));
      if (accepted.length) onFiles(accepted);
    },
    [accept, onFiles],
  );

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    if (disabled) return;
    handleFiles(filesFromDataTransfer(event.dataTransfer));
  };

  return (
    <div className="stack-sm">
      <div
        className={[
          'dropzone',
          size === 'lg' ? 'dropzone-lg' : '',
          size === 'sm' ? 'dropzone-sm' : '',
          dragging ? 'dropzone-active' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        style={disabled ? { opacity: 0.55, cursor: 'not-allowed' } : undefined}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(event) => {
          if (disabled) return;
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragEnter={(event) => {
          event.preventDefault();
          if (disabled) return;
          dragDepth.current += 1;
          setDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          event.preventDefault();
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (dragDepth.current === 0) setDragging(false);
        }}
        onDrop={onDrop}
      >
        <div className="dropzone-icon">{icon ?? <Upload />}</div>
        <div className="dropzone-title">{dragging ? 'Release to add files' : title}</div>
        {size !== 'sm' && <div className="dropzone-hint">{hint}</div>}
        {size === 'sm' && compactLabel && <div className="dropzone-hint">{compactLabel}</div>}
        {formats && formats.length > 0 && (
          <div className="dropzone-formats">
            {formats.map((format) => (
              <span key={format} className="chip chip-format">
                {format}
              </span>
            ))}
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          hidden
          accept={accept}
          multiple={multiple}
          onChange={(event) => {
            handleFiles(Array.from(event.target.files ?? []));
            event.target.value = '';
          }}
        />
      </div>

      {rejections.length > 0 && (
        <Notice tone="warning" title="Some files were skipped">
          {rejections.length === 1
            ? `"${rejections[0]}" is not a supported format for this tool.`
            : `${rejections.length} files were not in a supported format: ${rejections
                .slice(0, 3)
                .join(', ')}${rejections.length > 3 ? '…' : ''}`}
        </Notice>
      )}
    </div>
  );
}

/* ==========================================================================
   File cards
   ========================================================================== */

const STATUS_TONE: Record<FileStatus, 'neutral' | 'info' | 'success' | 'danger'> = {
  ready: 'neutral',
  processing: 'info',
  done: 'success',
  error: 'danger',
};

const STATUS_LABEL: Record<FileStatus, string> = {
  ready: 'Ready',
  processing: 'Working',
  done: 'Done',
  error: 'Failed',
};

export function FileCard({
  item,
  onRemove,
  extra,
  disabled = false,
}: {
  item: QueuedFile;
  onRemove?: (id: string) => void;
  extra?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <div className="filecard">
      <div className="filecard-thumb">
        {item.previewUrl ? (
          <img src={item.previewUrl} alt="" loading="lazy" />
        ) : (
          <FileText />
        )}
      </div>
      {item.status !== 'ready' && (
        <div className="filecard-status">
          <Badge tone={STATUS_TONE[item.status]}>{item.message ?? STATUS_LABEL[item.status]}</Badge>
        </div>
      )}
      {onRemove && !disabled && (
        <button
          type="button"
          className="filecard-remove"
          aria-label={`Remove ${item.file.name}`}
          onClick={() => onRemove(item.id)}
        >
          <X />
        </button>
      )}
      <div className="filecard-body">
        <span className="filecard-name" title={item.file.name}>
          {truncateMiddle(item.file.name, 26)}
        </span>
        <span className="filecard-meta">
          <span className="chip chip-format">{item.kind}</span>
          {formatBytes(item.file.size)}
        </span>
        {extra}
      </div>
    </div>
  );
}

export function FileGrid({
  items,
  onRemove,
  renderExtra,
  disabled,
}: {
  items: QueuedFile[];
  onRemove?: (id: string) => void;
  renderExtra?: (item: QueuedFile) => ReactNode;
  disabled?: boolean;
}) {
  return (
    <div className="filegrid">
      {items.map((item) => (
        <FileCard
          key={item.id}
          item={item}
          onRemove={onRemove}
          disabled={disabled}
          extra={renderExtra?.(item)}
        />
      ))}
    </div>
  );
}

export function FileRow({
  item,
  onRemove,
  right,
}: {
  item: QueuedFile;
  onRemove?: (id: string) => void;
  right?: ReactNode;
}) {
  return (
    <div className="filerow">
      <FileText style={{ width: 16, height: 16, color: 'var(--text-2)' }} />
      <span className="filerow-name grow" title={item.file.name}>
        {item.file.name}
      </span>
      <span className="chip chip-format">{item.kind}</span>
      <span className="dim tiny mono nowrap">{formatBytes(item.file.size)}</span>
      {right}
      {onRemove && (
        <button
          type="button"
          className="btn btn-ghost btn-sm btn-icon"
          aria-label={`Remove ${item.file.name}`}
          onClick={() => onRemove(item.id)}
        >
          <X />
        </button>
      )}
    </div>
  );
}

/* ==========================================================================
   Queue header (count + bulk actions)
   ========================================================================== */

export function QueueHeader({
  count,
  label = 'files',
  onAdd,
  onClear,
  busy = false,
  children,
}: {
  count: number;
  label?: string;
  onAdd?: () => void;
  onClear?: () => void;
  busy?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="spread">
      <div className="row">
        <Badge tone="accent">
          {count} {count === 1 ? label.replace(/s$/, '') : label}
        </Badge>
        {busy && <span className="spinner" />}
        {children}
      </div>
      <div className="row">
        {onAdd && (
          <Button size="sm" variant="outline" icon={<FolderOpen />} onClick={onAdd}>
            Add more
          </Button>
        )}
        {onClear && count > 0 && (
          <Button size="sm" variant="ghost" onClick={onClear} disabled={busy}>
            Clear all
          </Button>
        )}
      </div>
    </div>
  );
}

/* ==========================================================================
   Before / after comparison slider
   ========================================================================== */

export function CompareSlider({
  beforeUrl,
  afterUrl,
  beforeLabel = 'Before',
  afterLabel = 'After',
  aspect,
}: {
  beforeUrl: string;
  afterUrl: string;
  beforeLabel?: string;
  afterLabel?: string;
  aspect?: number;
}) {
  const [position, setPosition] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const updateFromEvent = useCallback((clientX: number) => {
    const element = containerRef.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const ratio = ((clientX - rect.left) / rect.width) * 100;
    setPosition(Math.min(100, Math.max(0, ratio)));
  }, []);

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      if (!dragging.current) return;
      updateFromEvent(event.clientX);
    };
    const onUp = () => {
      dragging.current = false;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [updateFromEvent]);

  return (
    <div
      className="compare"
      ref={containerRef}
      style={aspect ? { aspectRatio: String(aspect) } : undefined}
      onPointerDown={(event) => {
        dragging.current = true;
        updateFromEvent(event.clientX);
      }}
    >
      <img src={beforeUrl} alt={`${beforeLabel} preview`} />
      <div className="compare-after" style={{ clipPath: `inset(0 0 0 ${position}%)` }}>
        <img src={afterUrl} alt={`${afterLabel} preview`} />
      </div>
      <div className="compare-handle" style={{ left: `${position}%` }} />
      <span className="compare-tag" style={{ left: 10 }}>
        {beforeLabel}
      </span>
      <span className="compare-tag" style={{ right: 10 }}>
        {afterLabel}
      </span>
    </div>
  );
}

/* ==========================================================================
   Bottom action bar
   ========================================================================== */

export function ActionBar({ info, children }: { info?: ReactNode; children: ReactNode }) {
  return (
    <div className="actionbar">
      <div className="actionbar-inner">
        {info && <div className="actionbar-info">{info}</div>}
        {!info && <div className="actionbar-info" />}
        {children}
      </div>
    </div>
  );
}

import { useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { ToolShell } from '../../../components/ToolShell';
import {
  Badge,
  Button,
  CopyButton,
  Notice,
  Panel,
  Stat,
  TextArea,
  TextInput,
} from '../../../components/ui';
import { useDebounced } from '../../../core/hooks';
import { formatNumber, formatBytes } from '../../../core/format';

type Json = unknown;

interface Stats {
  nodes: number;
  objects: number;
  arrays: number;
  depth: number;
}

function walkStats(value: Json, depth = 0, acc: Stats = { nodes: 0, objects: 0, arrays: 0, depth: 0 }): Stats {
  acc.nodes += 1;
  acc.depth = Math.max(acc.depth, depth);
  if (Array.isArray(value)) {
    acc.arrays += 1;
    for (const v of value) walkStats(v, depth + 1, acc);
  } else if (value !== null && typeof value === 'object') {
    acc.objects += 1;
    for (const v of Object.values(value as Record<string, Json>)) walkStats(v, depth + 1, acc);
  }
  return acc;
}

function typeOf(value: Json): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return `array(${value.length})`;
  if (typeof value === 'object') return `object(${Object.keys(value as object).length})`;
  return typeof value;
}

function formatScalar(value: Json): string {
  if (typeof value === 'string') return `"${value.length > 120 ? value.slice(0, 120) + '…' : value}"`;
  return String(value);
}

function childPath(parent: string, key: string | number, isArray: boolean): string {
  return isArray ? `${parent}[${key}]` : parent === '$' ? `$.${key}` : `${parent}.${key}`;
}

/** Whether a subtree (or its key/leaf value) matches the query. */
function matches(key: string, value: Json, q: string): boolean {
  if (!q) return true;
  if (key.toLowerCase().includes(q)) return true;
  if (value === null || typeof value !== 'object') return String(value).toLowerCase().includes(q);
  return Object.entries(value as Record<string, Json>).some(([k, v]) => matches(k, v, q));
}

function Node({
  name,
  value,
  path,
  depth,
  query,
  onCopyPath,
}: {
  name: string;
  value: Json;
  path: string;
  depth: number;
  query: string;
  onCopyPath: (p: string) => void;
}) {
  const isContainer = value !== null && typeof value === 'object';
  const [open, setOpen] = useState(depth < 2);
  const expanded = query ? true : open;

  if (!isContainer) {
    return (
      <div className="row" style={{ gap: 8, paddingLeft: depth * 16, alignItems: 'baseline', minHeight: 22 }}>
        <span style={{ width: 12 }} />
        <span className="mono tiny strong" style={{ color: 'var(--info)' }}>
          {name}
        </span>
        <Badge>{typeOf(value)}</Badge>
        <span className="mono tiny" style={{ color: typeof value === 'string' ? 'var(--success)' : typeof value === 'number' ? 'var(--amber)' : typeof value === 'boolean' ? 'var(--violet)' : 'var(--text-2)', wordBreak: 'break-all' }}>
          {formatScalar(value)}
        </span>
        <button type="button" className="btn btn-ghost btn-sm" style={{ height: 20, padding: '0 6px', fontSize: 11 }} onClick={() => onCopyPath(path)}>
          path
        </button>
      </div>
    );
  }

  const isArr = Array.isArray(value);
  const entries: Array<[string | number, Json]> = isArr
    ? (value as Json[]).map((v, i) => [i, v])
    : Object.entries(value as Record<string, Json>);
  const visibleEntries = query ? entries.filter(([k, v]) => matches(String(k), v, query)) : entries;

  if (query && visibleEntries.length === 0) return null;

  return (
    <div>
      <div className="row" style={{ gap: 8, paddingLeft: depth * 16, minHeight: 24 }}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          style={{ background: 'none', border: 0, color: 'var(--text-1)', cursor: 'pointer', width: 12, padding: 0 }}
          aria-label={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? '▾' : '▸'}
        </button>
        <span className="mono tiny strong" style={{ color: 'var(--info)' }}>
          {name}
        </span>
        <Badge tone={isArr ? 'warning' : 'accent'}>{isArr ? `array · ${entries.length}` : `object · ${entries.length}`}</Badge>
        <button type="button" className="btn btn-ghost btn-sm" style={{ height: 20, padding: '0 6px', fontSize: 11 }} onClick={() => onCopyPath(path)}>
          path
        </button>
      </div>
      {expanded &&
        visibleEntries.map(([k, v]) => (
          <Node
            key={String(k)}
            name={isArr ? `[${k}]` : String(k)}
            value={v}
            path={childPath(path, k, isArr)}
            depth={depth + 1}
            query={query}
            onCopyPath={onCopyPath}
          />
        ))}
    </div>
  );
}

const SAMPLE = `{
  "name": "Goblin",
  "stats": { "hp": 30, "speed": 4.5, "resistances": ["fire", "ice"] },
  "loot": [
    { "item": "Dagger", "chance": 0.25 },
    { "item": "Gold", "chance": 1 }
  ],
  "isBoss": false
}`;

export default function JsonTreeViewer() {
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [copiedPath, setCopiedPath] = useState<string | null>(null);
  const debounced = useDebounced(input, 250);
  const debouncedQuery = useDebounced(query.trim().toLowerCase(), 150);

  const parsed = useMemo(() => {
    const text = debounced.trim();
    if (!text) return { value: undefined as Json, error: null as string | null, stats: null as Stats | null };
    try {
      const value = JSON.parse(text) as Json;
      return { value, error: null, stats: walkStats(value) };
    } catch (error) {
      return { value: undefined, error: error instanceof Error ? error.message : 'Invalid JSON', stats: null };
    }
  }, [debounced]);

  const reset = () => {
    setInput('');
    setQuery('');
    setCopiedPath(null);
  };

  const onCopyPath = async (p: string) => {
    try {
      await navigator.clipboard.writeText(p);
      setCopiedPath(p);
      window.setTimeout(() => setCopiedPath((cur) => (cur === p ? null : cur)), 1400);
    } catch {
      setCopiedPath(p);
    }
  };

  return (
    <ToolShell
      sidebar={
        <>
          <div className="field">
            <div className="field-label">Search keys and values</div>
            <TextInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. hp or fire" />
            <div className="field-hint">Matching branches are expanded automatically. Click “path” to copy a JSONPath-style address.</div>
          </div>
          {copiedPath && (
            <Notice tone="success" title="Path copied">
              <span className="mono tiny">{copiedPath}</span>
            </Notice>
          )}
        </>
      }
      actions={
        <>
          <Button variant="ghost" icon={<RefreshCw />} onClick={reset}>
            Reset
          </Button>
          <Button variant="outline" onClick={() => setInput(SAMPLE)}>
            Load sample
          </Button>
          <CopyButton value={debounced} label="Copy JSON" />
        </>
      }
      info={parsed.stats ? `${formatNumber(parsed.stats.nodes)} nodes` : undefined}
    >
      <div className="grid-2">
        <Panel title="JSON">
          <TextArea value={input} onChange={(e) => setInput(e.target.value)} placeholder="Paste JSON to explore…" style={{ minHeight: 360 }} />
        </Panel>
        <Panel title="Tree">
          {parsed.error ? (
            <Notice tone="error" title="Invalid JSON">
              <span className="mono tiny">{parsed.error}</span>
            </Notice>
          ) : parsed.value === undefined ? (
            <Notice tone="info">Paste JSON on the left to explore its structure.</Notice>
          ) : (
            <div style={{ maxHeight: 460, overflow: 'auto' }} className="mono">
              <Node name="$" value={parsed.value} path="$" depth={0} query={debouncedQuery} onCopyPath={onCopyPath} />
            </div>
          )}
        </Panel>
      </div>
      {parsed.stats && (
        <div className="grid-4">
          <Stat label="Nodes" value={formatNumber(parsed.stats.nodes)} />
          <Stat label="Objects" value={formatNumber(parsed.stats.objects)} />
          <Stat label="Arrays" value={formatNumber(parsed.stats.arrays)} />
          <Stat label="Max depth" value={formatNumber(parsed.stats.depth)} sub={formatBytes(new Blob([debounced]).size)} />
        </div>
      )}
    </ToolShell>
  );
}

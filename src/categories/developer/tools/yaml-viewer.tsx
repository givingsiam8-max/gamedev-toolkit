import { useMemo, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { dump, load } from 'js-yaml';
import { ToolShell } from '../../../components/ToolShell';
import {
  Badge,
  Button,
  CopyButton,
  Field,
  Notice,
  Panel,
  Segmented,
  Stat,
  TextArea,
  useToast,
} from '../../../components/ui';
import { useDebounced } from '../../../core/hooks';
import { downloadText } from '../../../core/files';
import { formatBytes } from '../../../core/format';

type Direction = 'yaml-json' | 'json-yaml';
type View = 'tree' | 'text';

interface ParseIssue {
  message: string;
  line?: number;
  column?: number;
}

function issueFrom(error: unknown): ParseIssue {
  const message = error instanceof Error ? error.message : String(error);
  const mark = (error as { mark?: { line?: number; column?: number } }).mark;
  return { message, line: mark?.line !== undefined ? mark.line + 1 : undefined, column: mark?.column };
}

function countNodes(value: unknown): number {
  if (Array.isArray(value)) return value.length + value.reduce((s, v) => s + countNodes(v), 0);
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    return entries.length + entries.reduce((s, [, v]) => s + countNodes(v), 0);
  }
  return 0;
}

function TreeNode({ name, value, depth }: { name: string; value: unknown; depth: number }) {
  const isList = Array.isArray(value);
  const isObject = !isList && value !== null && typeof value === 'object';
  const [open, setOpen] = useState(depth < 2);

  if (!isList && !isObject) {
    const type = value === null ? 'null' : typeof value;
    return (
      <div className="row" style={{ gap: 8, paddingLeft: depth * 16, alignItems: 'baseline' }}>
        <span className="mono tiny strong" style={{ color: 'var(--text-1)' }}>
          {name}
        </span>
        <Badge tone={type === 'number' ? 'info' : type === 'boolean' ? 'accent' : 'neutral'}>{type}</Badge>
        <span className="mono tiny">{value === null ? 'null' : String(value)}</span>
      </div>
    );
  }

  const entries: Array<[string, unknown]> = isList
    ? (value as unknown[]).map((v, i) => [String(i), v])
    : Object.entries(value as Record<string, unknown>);

  return (
    <div>
      <button
        type="button"
        className="row tiny strong"
        style={{ gap: 6, paddingLeft: depth * 16, background: 'none', border: 0, color: 'var(--text-1)', cursor: 'pointer' }}
        onClick={() => setOpen((v) => !v)}
      >
        <span>{open ? '▾' : '▸'}</span>
        <span className="mono">{name}</span>
        <Badge tone="neutral">
          {isList ? `array · ${entries.length}` : `object · ${entries.length}`}
        </Badge>
      </button>
      {open &&
        entries.map(([key, child]) => (
          <TreeNode key={key} name={key} value={child} depth={depth + 1} />
        ))}
    </div>
  );
}

export default function YamlViewer() {
  const toast = useToast();
  const [input, setInput] = useState('');
  const [direction, setDirection] = useState<Direction>('yaml-json');
  const [view, setView] = useState<View>('tree');
  const debounced = useDebounced(input);

  const result = useMemo(() => {
    const text = debounced.trim();
    if (!text) return { value: undefined as unknown, issue: null as ParseIssue | null, json: '', yaml: '' };
    if (direction === 'yaml-json') {
      try {
        const value = load(text);
        return { value, issue: null, json: JSON.stringify(value ?? null, null, 2), yaml: '' };
      } catch (error) {
        return { value: undefined, issue: issueFrom(error), json: '', yaml: '' };
      }
    }
    try {
      const value = JSON.parse(text);
      return { value, issue: null, json: '', yaml: dump(value, { lineWidth: 100 }) };
    } catch (error) {
      return { value: undefined, issue: issueFrom(error), json: '', yaml: '' };
    }
  }, [debounced, direction]);

  const reset = () => {
    setInput('');
    setDirection('yaml-json');
    setView('tree');
  };

  const outputText = direction === 'yaml-json' ? result.json : result.yaml;
  const nodeCount = result.value === undefined ? null : countNodes(result.value);

  return (
    <ToolShell
      sidebar={
        <>
          <Field label="Direction">
            <Segmented<Direction>
              options={[
                { value: 'yaml-json', label: 'YAML → JSON' },
                { value: 'json-yaml', label: 'JSON → YAML' },
              ]}
              value={direction}
              onChange={setDirection}
            />
          </Field>
          {direction === 'yaml-json' && (
            <Field label="View">
              <Segmented<View>
                options={[
                  { value: 'tree', label: 'Tree' },
                  { value: 'text', label: 'JSON' },
                ]}
                value={view}
                onChange={setView}
              />
            </Field>
          )}
          <Notice tone="info">
            Parsed with js-yaml in a browser context: anchors and aliases work, but custom tags
            and multi-document streams are reported as errors.
          </Notice>
        </>
      }
      actions={
        <>
          <Button variant="ghost" icon={<RefreshCw />} onClick={reset}>
            Reset
          </Button>
          <CopyButton value={outputText} />
          <Button
            variant="primary"
            icon={<Download />}
            disabled={!outputText}
            onClick={() => {
              downloadText(outputText, direction === 'yaml-json' ? 'converted.json' : 'converted.yaml');
              toast.success('Downloaded.');
            }}
          >
            Download
          </Button>
        </>
      }
      info={result.issue ? 'Parse error' : outputText ? formatBytes(new Blob([outputText]).size) : undefined}
    >
      <div className="grid-2">
        <Panel title={direction === 'yaml-json' ? 'YAML input' : 'JSON input'}>
          <TextArea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={direction === 'yaml-json' ? 'name: value\nitems:\n  - one\n  - two' : '{ "name": "value" }'}
            style={{ minHeight: 340 }}
          />
        </Panel>
        <Panel title={direction === 'yaml-json' ? 'Result' : 'YAML output'}>
          {result.issue ? (
            <Notice tone="error" title="Could not parse">
              <div className="stack-sm">
                <span className="mono tiny">{result.issue.message}</span>
                {result.issue.line !== undefined && (
                  <Stat label="Location" value={`line ${result.issue.line}, column ${result.issue.column ?? '?'}`} />
                )}
              </div>
            </Notice>
          ) : direction === 'yaml-json' && view === 'tree' ? (
            <div className="stack-sm" style={{ maxHeight: 420, overflow: 'auto' }}>
              {result.value === undefined || result.value === null ? (
                <Notice tone="info">Empty document.</Notice>
              ) : (
                <TreeNode name="(root)" value={result.value} depth={0} />
              )}
            </div>
          ) : (
            <TextArea value={outputText} readOnly style={{ minHeight: 340 }} />
          )}
        </Panel>
      </div>
      {nodeCount !== null && (
        <div className="grid-2">
          <Stat label="Nodes" value={String(nodeCount)} />
          <Stat label="Input size" value={formatBytes(new Blob([debounced]).size)} />
        </div>
      )}
    </ToolShell>
  );
}

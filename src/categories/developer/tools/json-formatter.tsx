import { useMemo, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { ToolShell } from '../../../components/ToolShell';
import {
  Button,
  CheckBox,
  CopyButton,
  Field,
  Notice,
  Panel,
  Segmented,
  Select,
  Stat,
  TextArea,
  useToast,
} from '../../../components/ui';
import { useDebounced } from '../../../core/hooks';
import { downloadText } from '../../../core/files';
import { formatBytes } from '../../../core/format';

type Mode = 'pretty' | 'minify' | 'lines';

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value !== null && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) out[key] = sortKeysDeep(source[key]);
    return out;
  }
  return value;
}

export default function JsonFormatter() {
  const toast = useToast();
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<Mode>('pretty');
  const [indent, setIndent] = useState('2');
  const [sorted, setSorted] = useState(false);
  const debounced = useDebounced(input);

  const result = useMemo(() => {
    const text = debounced.trim();
    if (!text) return { output: '', error: null as string | null };
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      return { output: '', error: error instanceof Error ? error.message : String(error) };
    }
    if (sorted) parsed = sortKeysDeep(parsed);
    if (mode === 'minify') return { output: JSON.stringify(parsed), error: null };
    if (mode === 'lines') {
      const items = Array.isArray(parsed) ? parsed : [parsed];
      return { output: items.map((item) => JSON.stringify(item)).join('\n'), error: null };
    }
    const pad = indent === 'tab' ? '\t' : Number(indent);
    return { output: JSON.stringify(parsed, null, pad), error: null };
  }, [debounced, mode, indent, sorted]);

  const escape = () => setInput(JSON.stringify(input).slice(1, -1));

  const unescape = () => {
    try {
      setInput(JSON.parse(`"${input}"`) as string);
    } catch {
      toast.error('The text is not a valid escaped JSON string.');
    }
  };

  const reset = () => {
    setInput('');
    setMode('pretty');
    setIndent('2');
    setSorted(false);
  };

  const inBytes = new Blob([debounced]).size;
  const outBytes = new Blob([result.output]).size;

  return (
    <ToolShell
      sidebar={
        <>
          <Field label="Mode">
            <Segmented<Mode>
              options={[
                { value: 'pretty', label: 'Pretty' },
                { value: 'minify', label: 'Minify' },
                { value: 'lines', label: 'JSON Lines' },
              ]}
              value={mode}
              onChange={setMode}
            />
          </Field>
          {mode === 'pretty' && (
            <Field label="Indent">
              <Select
                value={indent}
                onChange={(event) => setIndent(event.target.value)}
                options={[
                  { value: '2', label: '2 spaces' },
                  { value: '4', label: '4 spaces' },
                  { value: '8', label: '8 spaces' },
                  { value: 'tab', label: 'Tab' },
                ]}
              />
            </Field>
          )}
          <CheckBox
            checked={sorted}
            onChange={setSorted}
            label="Sort keys"
            hint="Alphabetical, applied recursively to every object."
          />
          <Field label="String escaping" hint="Operate on the input text itself.">
            <div className="row">
              <Button size="sm" variant="outline" onClick={escape}>
                Escape
              </Button>
              <Button size="sm" variant="outline" onClick={unescape}>
                Unescape
              </Button>
            </div>
          </Field>
        </>
      }
      actions={
        <>
          <Button variant="ghost" icon={<RefreshCw />} onClick={reset}>
            Reset
          </Button>
          <CopyButton value={result.output} />
          <Button
            variant="primary"
            icon={<Download />}
            disabled={!result.output}
            onClick={() => {
              downloadText(result.output, mode === 'lines' ? 'data.jsonl' : 'formatted.json');
              toast.success('Downloaded.');
            }}
          >
            Download
          </Button>
        </>
      }
      info={result.error ? 'Invalid JSON' : result.output ? formatBytes(outBytes) : undefined}
    >
      <div className="grid-2">
        <Panel title="Input">
          <TextArea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Paste JSON here…"
            style={{ minHeight: 340 }}
          />
        </Panel>
        <Panel title="Output">
          {result.error ? (
            <Notice tone="error" title="Could not parse">
              <span className="mono tiny">{result.error}</span>
            </Notice>
          ) : (
            <TextArea
              value={result.output}
              readOnly
              placeholder="Formatted output appears here."
              style={{ minHeight: 340 }}
            />
          )}
        </Panel>
      </div>
      <div className="grid-2">
        <Stat label="Input size" value={formatBytes(inBytes)} />
        <Stat
          label="Output size"
          value={result.output ? formatBytes(outBytes) : '—'}
          tone={result.output && outBytes < inBytes ? 'ok' : 'neutral'}
          sub={
            result.output && inBytes > 0
              ? `${(((inBytes - outBytes) / inBytes) * 100).toFixed(1)}% ${outBytes <= inBytes ? 'smaller' : 'larger'}`
              : undefined
          }
        />
      </div>
    </ToolShell>
  );
}

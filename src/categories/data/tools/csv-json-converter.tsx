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
import { downloadText } from '../../../core/files';
import { useDebounced } from '../../../core/hooks';
import { formatBytes, formatNumber } from '../../../core/format';
import { detectDelimiter, parseCsv } from '../csv';

type Direction = 'csv-json' | 'json-csv';

function coerce(value: string): string | number | boolean | null {
  const v = value.trim();
  if (v === '') return null;
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (/^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?$/.test(v)) return Number(v);
  return value;
}

/** Writes "a.b" headers as nested objects. */
function setPath(target: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.');
  let node: Record<string, unknown> = target;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = parts[i];
    const next = node[key];
    if (next === undefined || next === null || typeof next !== 'object' || Array.isArray(next)) {
      node[key] = {};
    }
    node = node[key] as Record<string, unknown>;
  }
  node[parts[parts.length - 1]] = value;
}

export function csvToJson(text: string, delimiter: string, infer: boolean, nested: boolean): unknown[] {
  const rows = parseCsv(text, delimiter).filter((r) => r.some((c) => c !== ''));
  if (rows.length === 0) return [];
  const headers = rows[0].map((h, i) => (h.trim() === '' ? `column${i + 1}` : h.trim()));
  return rows.slice(1).map((row) => {
    const obj: Record<string, unknown> = {};
    headers.forEach((h, i) => {
      const raw = row[i] ?? '';
      const value = infer ? coerce(raw) : raw;
      if (nested && h.includes('.')) setPath(obj, h, value);
      else obj[h] = value;
    });
    return obj;
  });
}

function flatten(value: unknown, prefix = '', out: Record<string, unknown> = {}): Record<string, unknown> {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      flatten(v, prefix ? `${prefix}.${k}` : k, out);
    }
  } else {
    out[prefix] = value;
  }
  return out;
}

export function jsonToCsv(data: unknown): string {
  const items = Array.isArray(data) ? data : [data];
  const rows = items.map((item) => flatten(item));
  const headers: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    for (const k of Object.keys(row)) {
      if (!seen.has(k)) {
        seen.add(k);
        headers.push(k);
      }
    }
  }
  const quote = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const cell = (v: unknown) => {
    if (v === undefined || v === null) return '';
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  };
  const lines = [headers.map(quote).join(',')];
  for (const row of rows) lines.push(headers.map((h) => quote(cell(row[h]))).join(','));
  return lines.join('\n');
}

export default function CsvJsonConverter() {
  const toast = useToast();
  const [direction, setDirection] = useState<Direction>('csv-json');
  const [input, setInput] = useState('');
  const [delimiter, setDelimiter] = useState<string | null>(null);
  const [infer, setInfer] = useState(true);
  const [nested, setNested] = useState(true);
  const [pretty, setPretty] = useState(true);
  const debounced = useDebounced(input, 250);

  const effectiveDelimiter = delimiter ?? detectDelimiter(debounced);

  const result = useMemo(() => {
    if (!debounced.trim()) return { output: '', error: null as string | null, count: 0 };
    try {
      if (direction === 'csv-json') {
        const data = csvToJson(debounced, effectiveDelimiter, infer, nested);
        return { output: JSON.stringify(data, null, pretty ? 2 : 0), error: null, count: data.length };
      }
      const parsed: unknown = JSON.parse(debounced);
      if (parsed === null || typeof parsed !== 'object') {
        return { output: '', error: 'Expected a JSON array of objects (or a single object).', count: 0 };
      }
      const csv = jsonToCsv(parsed);
      const count = Array.isArray(parsed) ? parsed.length : 1;
      return { output: csv, error: null, count };
    } catch (error) {
      return { output: '', error: error instanceof Error ? error.message : 'Could not convert the input.', count: 0 };
    }
  }, [debounced, direction, effectiveDelimiter, infer, nested, pretty]);

  const reset = () => {
    setDirection('csv-json');
    setInput('');
    setDelimiter(null);
    setInfer(true);
    setNested(true);
    setPretty(true);
  };

  const ext = direction === 'csv-json' ? 'json' : 'csv';
  const inBytes = new Blob([debounced]).size;
  const outBytes = new Blob([result.output]).size;

  return (
    <ToolShell
      sidebar={
        <>
          <Field label="Direction">
            <Segmented<Direction>
              options={[
                { value: 'csv-json', label: 'CSV → JSON' },
                { value: 'json-csv', label: 'JSON → CSV' },
              ]}
              value={direction}
              onChange={setDirection}
            />
          </Field>
          {direction === 'csv-json' && (
            <>
              <Field label="Delimiter">
                <Select
                  value={delimiter ?? effectiveDelimiter}
                  onChange={(e) => setDelimiter(e.target.value)}
                  options={[
                    { value: ',', label: 'Comma' },
                    { value: ';', label: 'Semicolon' },
                    { value: '\t', label: 'Tab' },
                    { value: '|', label: 'Pipe' },
                  ]}
                />
              </Field>
              <CheckBox checked={infer} onChange={setInfer} label="Infer numbers, booleans and null" hint="Off keeps every value as text." />
              <CheckBox checked={nested} onChange={setNested} label="Nest “a.b” headers" hint="Headers with dots become nested objects." />
            </>
          )}
          <CheckBox checked={pretty} onChange={setPretty} label="Pretty-print JSON" />
          {direction === 'json-csv' && (
            <Notice tone="info">
              Nested objects are flattened to dotted headers (<span className="mono">a.b</span>). Arrays
              inside a cell are written as JSON text.
            </Notice>
          )}
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
              downloadText(result.output, `converted.${ext}`);
              toast.success('Downloaded.');
            }}
          >
            Download .{ext}
          </Button>
        </>
      }
      info={result.output ? `${formatNumber(result.count)} record(s)` : undefined}
    >
      <div className="grid-2">
        <Panel title={direction === 'csv-json' ? 'CSV input' : 'JSON input'}>
          <TextArea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={direction === 'csv-json' ? 'id,name,hp\n1,Goblin,30' : '[{"id":1,"name":"Goblin"}]'}
            style={{ minHeight: 340 }}
          />
        </Panel>
        <Panel title={direction === 'csv-json' ? 'JSON output' : 'CSV output'}>
          {result.error ? (
            <Notice tone="error" title="Could not convert">
              <span className="mono tiny">{result.error}</span>
            </Notice>
          ) : (
            <TextArea value={result.output} readOnly style={{ minHeight: 340 }} />
          )}
        </Panel>
      </div>
      <div className="grid-2">
        <Stat label="Input" value={formatBytes(inBytes)} />
        <Stat label="Output" value={result.output ? formatBytes(outBytes) : '—'} />
      </div>
    </ToolShell>
  );
}

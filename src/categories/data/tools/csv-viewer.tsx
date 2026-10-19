import { useMemo, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { ToolShell } from '../../../components/ToolShell';
import {
  Badge,
  Button,
  Field,
  NumberInput,
  Notice,
  Panel,
  Select,
  Stat,
  TextArea,
  useToast,
} from '../../../components/ui';
import { DropZone } from '../../../components/files';
import { downloadText, readAsText } from '../../../core/files';
import { useDebounced } from '../../../core/hooks';
import { formatNumber, formatBytes } from '../../../core/format';
import { CSV_DELIMITERS, detectDelimiter, parseCsv, type Table } from '../csv';

const MAX_ROWS_RENDER = 500;
const DELIM_LABEL: Record<string, string> = { ',': 'Comma', ';': 'Semicolon', '\t': 'Tab', '|': 'Pipe' };

export default function CsvViewer() {
  const toast = useToast();
  const [raw, setRaw] = useState('');
  const [fileName, setFileName] = useState('');
  const [fileSize, setFileSize] = useState(0);
  const [delimiter, setDelimiter] = useState<string>(',');
  const [hasHeader, setHasHeader] = useState(true);
  const [sortCol, setSortCol] = useState<number | null>(null);
  const [sortDesc, setSortDesc] = useState(false);
  const [filter, setFilter] = useState('');
  const [limit, setLimit] = useState(MAX_ROWS_RENDER);
  const debouncedRaw = useDebounced(raw, 250);
  const debouncedFilter = useDebounced(filter, 150);

  const table = useMemo<Table>(() => (debouncedRaw.trim() ? parseCsv(debouncedRaw, delimiter) : []), [debouncedRaw, delimiter]);

  const header = hasHeader && table.length > 0 ? table[0] : null;
  const body = useMemo(() => (hasHeader ? table.slice(1) : table), [table, hasHeader]);
  const width = Math.max(0, ...table.map((r) => r.length));

  const filtered = useMemo(() => {
    const q = debouncedFilter.trim().toLowerCase();
    let rows = q ? body.filter((r) => r.some((c) => c.toLowerCase().includes(q))) : body;
    if (sortCol !== null) {
      const col = sortCol;
      const numeric = rows.every((r) => r[col] === undefined || r[col] === '' || !Number.isNaN(Number(r[col])));
      rows = [...rows].sort((a, b) => {
        const x = a[col] ?? '';
        const y = b[col] ?? '';
        const cmp = numeric ? Number(x || 0) - Number(y || 0) : x.localeCompare(y, undefined, { numeric: true });
        return sortDesc ? -cmp : cmp;
      });
    }
    return rows;
  }, [body, debouncedFilter, sortCol, sortDesc]);

  const onFiles = async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    try {
      const text = await readAsText(file);
      setRaw(text);
      setFileName(file.name);
      setFileSize(file.size);
      setDelimiter(file.name.toLowerCase().endsWith('.tsv') ? '\t' : detectDelimiter(text));
      setSortCol(null);
      setFilter('');
      setLimit(MAX_ROWS_RENDER);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not read the file.');
    }
  };

  const toggleSort = (col: number) => {
    if (sortCol === col) {
      if (sortDesc) setSortCol(null);
      setSortDesc(!sortDesc);
    } else {
      setSortCol(col);
      setSortDesc(false);
    }
  };

  const exportCsv = () => {
    const quote = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const out = [...(header ? [header] : []), ...filtered].map((r) => r.map(quote).join(','));
    downloadText(out.join('\n'), `${fileName.replace(/\.[^.]+$/, '') || 'table'}-filtered.csv`, 'text/csv');
  };

  const reset = () => {
    setRaw('');
    setFileName('');
    setFileSize(0);
    setDelimiter(',');
    setHasHeader(true);
    setSortCol(null);
    setSortDesc(false);
    setFilter('');
    setLimit(MAX_ROWS_RENDER);
  };

  const visible = filtered.slice(0, limit);
  const headerCells = header ?? Array.from({ length: width }, (_, i) => `Column ${i + 1}`);

  return (
    <ToolShell
      sidebar={
        <>
          <Field label="Delimiter" hint={fileName ? 'Auto-detected — change it if the columns look wrong.' : undefined}>
            <Select
              value={delimiter}
              onChange={(e) => setDelimiter(e.target.value)}
              options={CSV_DELIMITERS.map((d) => ({ value: d, label: DELIM_LABEL[d] }))}
            />
          </Field>
          <Field label="First row">
            <Select
              value={hasHeader ? 'yes' : 'no'}
              onChange={(e) => setHasHeader(e.target.value === 'yes')}
              options={[
                { value: 'yes', label: 'Is a header row' },
                { value: 'no', label: 'Data only' },
              ]}
            />
          </Field>
          <Field label="Rows shown">
            <NumberInput value={limit} min={10} max={5000} step={50} onChange={(n) => setLimit(Math.max(10, Math.min(5000, n || 0)))} />
          </Field>
        </>
      }
      actions={
        <>
          <Button variant="ghost" icon={<RefreshCw />} onClick={reset}>
            Reset
          </Button>
          <Button variant="primary" icon={<Download />} disabled={!table.length} onClick={exportCsv}>
            Export filtered CSV
          </Button>
        </>
      }
      info={table.length ? `${formatNumber(body.length)} rows · ${formatNumber(width)} columns` : undefined}
    >
      {!raw ? (
        <DropZone onFiles={onFiles} accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values" formats={['CSV', 'TSV']} size="lg" title="Drop a CSV or TSV file" />
      ) : (
        <>
          <div className="grid-3">
            <Stat label="File" value={fileName || 'Pasted text'} sub={fileSize ? formatBytes(fileSize) : undefined} />
            <Stat label="Rows" value={formatNumber(body.length)} sub={hasHeader ? 'excluding header' : undefined} />
            <Stat label="Columns" value={formatNumber(width)} tone={width > 0 ? 'neutral' : 'warn'} />
          </div>

          <Panel
            title="Table"
            actions={
              <div className="row">
                <Badge tone="accent">
                  {formatNumber(filtered.length)} shown{filtered.length !== body.length ? ` of ${formatNumber(body.length)}` : ''}
                </Badge>
                <input
                  className="input"
                  style={{ width: 220, height: 30 }}
                  placeholder="Filter rows…"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  aria-label="Filter rows"
                />
              </div>
            }
            flush
          >
            <div style={{ maxHeight: 520, overflow: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 48 }}>#</th>
                    {headerCells.map((h, i) => (
                      <th key={i}>
                        <button
                          type="button"
                          onClick={() => toggleSort(i)}
                          style={{ background: 'none', border: 0, padding: 0, color: 'inherit', font: 'inherit', cursor: 'pointer', textTransform: 'inherit', letterSpacing: 'inherit' }}
                          title="Sort"
                        >
                          {h || <span className="dim">(empty)</span>}
                          {sortCol === i ? (sortDesc ? ' ↓' : ' ↑') : ''}
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visible.map((row, r) => (
                    <tr key={r}>
                      <td className="mono dim">{r + 1}</td>
                      {Array.from({ length: width }, (_, c) => (
                        <td key={c} className="mono tiny" style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row[c] ?? ''}>
                          {row[c] ?? ''}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtered.length > visible.length && (
                <div className="dim tiny" style={{ padding: 10 }}>
                  Showing {formatNumber(visible.length)} of {formatNumber(filtered.length)} rows. Raise “Rows shown” to see more.
                </div>
              )}
            </div>
          </Panel>

          {width > 0 && body.some((r) => r.length !== width) && (
            <Notice tone="warning" title="Ragged rows">
              Some rows have a different number of fields than the widest row. Missing cells are shown empty.
            </Notice>
          )}
        </>
      )}

      {!raw && (
        <Panel title="Or paste CSV text">
          <TextArea value={raw} onChange={(e) => setRaw(e.target.value)} placeholder="name,hp,speed&#10;Goblin,30,4" style={{ minHeight: 140 }} />
        </Panel>
      )}
    </ToolShell>
  );
}

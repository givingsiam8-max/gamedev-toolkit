import { useMemo, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { ToolShell } from '../../../components/ToolShell';
import {
  Badge,
  Button,
  CheckBox,
  Field,
  NumberInput,
  Notice,
  Panel,
  Select,
  Stat,
  TextInput,
  useToast,
} from '../../../components/ui';
import { DropZone, FileGrid, QueueHeader, useFileQueue } from '../../../components/files';
import { downloadText } from '../../../core/files';
import { extname, formatNumber, naturalCompare, stripExt } from '../../../core/format';

type Style = 'any' | 'pascal' | 'camel' | 'snake' | 'kebab';

const STYLE_OPTIONS: Array<{ value: Style; label: string }> = [
  { value: 'any', label: 'Any style' },
  { value: 'pascal', label: 'PascalCase' },
  { value: 'camel', label: 'camelCase' },
  { value: 'snake', label: 'snake_case' },
  { value: 'kebab', label: 'kebab-case' },
];

const STYLE_RE: Record<Exclude<Style, 'any'>, RegExp> = {
  pascal: /^[A-Z][A-Za-z0-9]*$/,
  camel: /^[a-z][A-Za-z0-9]*$/,
  snake: /^[a-z0-9]+(_[a-z0-9]+)*$/,
  kebab: /^[a-z0-9]+(-[a-z0-9]+)*$/,
};

function splitWords(value: string): string[] {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function applyStyle(words: string[], style: Style): string {
  if (!words.length) return '';
  if (style === 'snake') return words.map((w) => w.toLowerCase()).join('_');
  if (style === 'kebab') return words.map((w) => w.toLowerCase()).join('-');
  if (style === 'pascal') return words.map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase()).join('');
  if (style === 'camel') {
    return words
      .map((w, i) => (i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase()))
      .join('');
  }
  return words.join('_');
}

interface Row {
  id: string;
  name: string;
  issues: string[];
  suggestion: string;
}

export default function AssetNamingValidator() {
  const toast = useToast();
  const queue = useFileQueue({ maxFiles: 500 });
  const [style, setStyle] = useState<Style>('pascal');
  const [maxLength, setMaxLength] = useState(64);
  const [asciiOnly, setAsciiOnly] = useState(true);
  const [noSpaces, setNoSpaces] = useState(true);
  const [prefix, setPrefix] = useState('');

  const rows = useMemo<Row[]>(() => {
    const seen = new Map<string, number>();
    return [...queue.items]
      .sort((a, b) => naturalCompare(a.file.name, b.file.name))
      .map((item) => {
        const base = stripExt(item.file.name);
        const issues: string[] = [];
        const lower = base.toLowerCase();
        seen.set(lower, (seen.get(lower) ?? 0) + 1);

        if (base.length > maxLength) issues.push(`name is ${base.length} chars (limit ${maxLength})`);
        if (noSpaces && /\s/.test(base)) issues.push('contains spaces');
        if (asciiOnly && /[^\x20-\x7E]/.test(base)) issues.push('contains non-ASCII characters');
        if (/[#%&{}<>*?/$!'":@+|\\]/.test(base)) issues.push('contains reserved or shell characters');
        if (style !== 'any' && !STYLE_RE[style].test(base)) issues.push(`not ${STYLE_OPTIONS.find((s) => s.value === style)?.label}`);
        if (prefix && !base.startsWith(prefix)) issues.push(`missing prefix “${prefix}”`);
        if (/^[._-]/.test(base)) issues.push('starts with punctuation');
        if (/[._-]$/.test(base)) issues.push('ends with punctuation');

        const words = splitWords(prefix && base.startsWith(prefix) ? base.slice(prefix.length) : base);
        let suggestion = applyStyle(words, style === 'any' ? 'pascal' : style);
        if (prefix) suggestion = prefix + suggestion;
        if (suggestion.length > maxLength) suggestion = suggestion.slice(0, maxLength);
        const ext = extname(item.file.name);
        if (ext) suggestion = `${suggestion}.${ext}`;

        return { id: item.id, name: item.file.name, issues, suggestion };
      })
      .map((row) => ({
        ...row,
        issues:
          row.issues.length === 0 && (seen.get(stripExt(row.name).toLowerCase()) ?? 0) > 1
            ? ['duplicate base name (case-insensitive)']
            : row.issues,
      }));
  }, [queue.items, style, maxLength, asciiOnly, noSpaces, prefix]);

  const invalid = rows.filter((row) => row.issues.length > 0);

  const exportCsv = () => {
    const header = 'name,issues,suggestion';
    const lines = rows.map((row) =>
      [`"${row.name.replace(/"/g, '""')}"`, `"${row.issues.join('; ')}"`, `"${row.suggestion}"`].join(','),
    );
    downloadText([header, ...lines].join('\n'), 'naming-report.csv', 'text/csv');
    toast.success('Naming report exported.');
  };

  const reset = () => {
    queue.clear();
    setStyle('pascal');
    setMaxLength(64);
    setAsciiOnly(true);
    setNoSpaces(true);
    setPrefix('');
  };

  return (
    <ToolShell
      sidebar={
        <>
          <Field label="Required style">
            <Select
              value={style}
              onChange={(e) => setStyle(e.target.value as Style)}
              options={STYLE_OPTIONS}
            />
          </Field>
          <Field label="Maximum length">
            <NumberInput value={maxLength} min={8} max={200} onChange={setMaxLength} />
          </Field>
          <Field label="Required prefix" hint="e.g. T_ for textures, SM_ for static meshes.">
            <TextInput value={prefix} onChange={(e) => setPrefix(e.target.value)} className="mono" />
          </Field>
          <CheckBox checked={noSpaces} onChange={setNoSpaces} label="Forbid spaces" />
          <CheckBox checked={asciiOnly} onChange={setAsciiOnly} label="ASCII only" />
          <Notice tone="info" title="Browser limits">
            Files are checked in memory. This tool cannot rename files inside a Unity project — export
            the report and apply the suggestions with your own asset pipeline or the Unity companion.
          </Notice>
        </>
      }
      actions={
        <>
          <Button variant="ghost" icon={<RefreshCw />} onClick={reset}>
            Reset
          </Button>
          <Button variant="success" icon={<Download />} disabled={!rows.length} onClick={exportCsv}>
            Export CSV
          </Button>
        </>
      }
      info={rows.length ? `${formatNumber(invalid.length)} of ${formatNumber(rows.length)} need attention` : undefined}
    >
      {queue.items.length === 0 ? (
        <DropZone
          onFiles={(files) => queue.add(files)}
          formats={['Any file']}
          size="lg"
          title="Drop assets or folders’ files to validate names"
        />
      ) : (
        <Panel title="Assets" actions={<QueueHeader count={queue.items.length} onClear={queue.clear} />}>
          <FileGrid items={queue.items} onRemove={queue.remove} />
        </Panel>
      )}

      {rows.length > 0 && (
        <>
          <div className="grid-3">
            <Stat label="Checked" value={formatNumber(rows.length)} />
            <Stat label="Passing" value={formatNumber(rows.length - invalid.length)} tone="ok" />
            <Stat label="Violations" value={formatNumber(invalid.length)} tone={invalid.length ? 'warn' : 'ok'} />
          </div>
          <Panel title="Validation report" flush>
            <div style={{ maxHeight: 460, overflow: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>File</th>
                    <th>Issues</th>
                    <th>Suggested name</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td className="mono tiny">{row.name}</td>
                      <td className="tiny" style={{ color: row.issues.length ? 'var(--amber)' : 'var(--text-2)' }}>
                        {row.issues.length ? row.issues.join(' · ') : '—'}
                      </td>
                      <td className="mono tiny">{row.suggestion}</td>
                      <td>
                        {row.issues.length ? (
                          <Badge tone="warning">fix</Badge>
                        ) : (
                          <Badge tone="success">ok</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
          {invalid.length > 0 && (
            <Notice tone="warning" title="How suggestions are made">
              The suggestion strips reserved characters, splits the name into words, re-applies the
              chosen style and prefix, and truncates to the length limit. It is deterministic — review
              it before using it in an automated pipeline.
            </Notice>
          )}
        </>
      )}
    </ToolShell>
  );
}

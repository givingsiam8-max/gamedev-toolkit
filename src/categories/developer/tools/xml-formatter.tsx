import { useMemo, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { ToolShell } from '../../../components/ToolShell';
import {
  Button,
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

type Mode = 'pretty' | 'minify';

interface Token {
  kind: 'open' | 'close' | 'self' | 'decl' | 'comment' | 'cdata' | 'dtd' | 'text';
  text: string;
}

const MAX_CHARS = 2_000_000;

function tokenize(xml: string): Token[] {
  const re = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<\/[^>]+>|<[^>]+>|[^<]+/g;
  const tokens: Token[] = [];
  for (const match of xml.matchAll(re)) {
    const text = match[0];
    if (text.startsWith('<!--')) tokens.push({ kind: 'comment', text });
    else if (text.startsWith('<![CDATA')) tokens.push({ kind: 'cdata', text });
    else if (text.startsWith('<?')) tokens.push({ kind: 'decl', text });
    else if (text.toUpperCase().startsWith('<!DOCTYPE')) tokens.push({ kind: 'dtd', text });
    else if (text.startsWith('</')) tokens.push({ kind: 'close', text });
    else if (text.startsWith('<')) tokens.push({ kind: text.endsWith('/>') ? 'self' : 'open', text });
    else tokens.push({ kind: 'text', text });
  }
  return tokens;
}

function pretty(xml: string, pad: string): string {
  const lines: string[] = [];
  let depth = 0;
  for (const token of tokenize(xml)) {
    if (token.kind === 'text') {
      const trimmed = token.text.trim();
      if (!trimmed) continue;
      const last = lines[lines.length - 1];
      if (last !== undefined && !last.endsWith('/>') && !last.includes('</')) {
        lines[lines.length - 1] = `${last}${trimmed}`;
      } else {
        lines.push(pad.repeat(depth) + trimmed);
      }
      continue;
    }
    if (token.kind === 'close') depth = Math.max(depth - 1, 0);
    lines.push(pad.repeat(depth) + token.text);
    if (token.kind === 'open') depth += 1;
  }
  return lines.join('\n');
}

function minify(xml: string): string {
  return tokenize(xml)
    .map((token) => (token.kind === 'text' ? token.text.trim() : token.text))
    .join('');
}

function parseError(xml: string): string | null {
  try {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const errors = doc.getElementsByTagName('parsererror');
    if (errors.length === 0) return null;
    return errors[0]?.textContent ?? 'Unknown XML parse error.';
  } catch {
    return 'Could not parse the document.';
  }
}

export default function XmlFormatter() {
  const toast = useToast();
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<Mode>('pretty');
  const [indent, setIndent] = useState('2');
  const debounced = useDebounced(input);

  const result = useMemo(() => {
    const text = debounced.trim();
    if (!text) return { output: '', error: null as string | null, tooBig: false };
    if (text.length > MAX_CHARS) return { output: '', error: null, tooBig: true };
    const error = parseError(text);
    if (error) return { output: '', error, tooBig: false };
    const pad = indent === 'tab' ? '\t' : ' '.repeat(Number(indent));
    return { output: mode === 'pretty' ? pretty(text, pad) : minify(text), error: null, tooBig: false };
  }, [debounced, mode, indent]);

  const reset = () => {
    setInput('');
    setMode('pretty');
    setIndent('2');
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
          <Notice tone="info">
            Well-formedness is checked with the browser XML parser. Documents with external
            DTDs or entities may report errors even when the markup itself is fine.
          </Notice>
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
              downloadText(result.output, 'formatted.xml');
              toast.success('Downloaded.');
            }}
          >
            Download
          </Button>
        </>
      }
      info={result.error ? 'Not well-formed' : result.output ? formatBytes(outBytes) : undefined}
    >
      <div className="grid-2">
        <Panel title="Input">
          <TextArea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Paste XML here…"
            style={{ minHeight: 340 }}
          />
        </Panel>
        <Panel title="Output">
          {result.tooBig ? (
            <Notice tone="warning" title="Document too large">
              Formatting is limited to {formatBytes(MAX_CHARS)} of text to keep the UI responsive.
            </Notice>
          ) : result.error ? (
            <Notice tone="error" title="XML parse error">
              <span className="tiny">{result.error}</span>
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
        />
      </div>
    </ToolShell>
  );
}

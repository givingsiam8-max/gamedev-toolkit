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
  Stat,
  TextArea,
  useToast,
} from '../../../components/ui';
import { useDebounced } from '../../../core/hooks';
import { downloadText } from '../../../core/files';
import { formatNumber } from '../../../core/format';

type Style =
  | 'camel'
  | 'pascal'
  | 'snake'
  | 'constant'
  | 'kebab'
  | 'title'
  | 'sentence'
  | 'upper'
  | 'lower'
  | 'dot';

const STYLES: Array<{ value: Style; label: string }> = [
  { value: 'camel', label: 'camelCase' },
  { value: 'pascal', label: 'PascalCase' },
  { value: 'snake', label: 'snake_case' },
  { value: 'constant', label: 'CONSTANT_CASE' },
  { value: 'kebab', label: 'kebab-case' },
  { value: 'title', label: 'Title Case' },
  { value: 'sentence', label: 'Sentence case' },
  { value: 'upper', label: 'UPPER CASE' },
  { value: 'lower', label: 'lower case' },
  { value: 'dot', label: 'dot.separated' },
];

const SMALL_WORDS = new Set(['a', 'an', 'the', 'and', 'but', 'or', 'for', 'of', 'to', 'in', 'on', 'at', 'by', 'with']);

function splitWords(src: string): string[] {
  return src
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
}

function apply(words: string[], style: Style, original: string): string {
  if (words.length === 0) return '';
  switch (style) {
    case 'camel':
      return words
        .map((w, i) => (i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase()))
        .join('');
    case 'pascal':
      return words.map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase()).join('');
    case 'snake':
      return words.map((w) => w.toLowerCase()).join('_');
    case 'constant':
      return words.map((w) => w.toUpperCase()).join('_');
    case 'kebab':
      return words.map((w) => w.toLowerCase()).join('-');
    case 'dot':
      return words.map((w) => w.toLowerCase()).join('.');
    case 'title':
      return words
        .map((w, i) => {
          const lower = w.toLowerCase();
          if (i > 0 && i < words.length - 1 && SMALL_WORDS.has(lower)) return lower;
          return w[0].toUpperCase() + lower.slice(1);
        })
        .join(' ');
    case 'sentence': {
      const joined = words.map((w) => w.toLowerCase()).join(' ');
      return joined ? joined[0].toUpperCase() + joined.slice(1) : joined;
    }
    case 'upper':
      return original.toUpperCase();
    case 'lower':
      return original.toLowerCase();
  }
}

export default function TextCaseConverter() {
  const toast = useToast();
  const [style, setStyle] = useState<Style>('camel');
  const [input, setInput] = useState('');
  const debounced = useDebounced(input, 120);

  const words = useMemo(() => splitWords(debounced), [debounced]);
  const output = useMemo(() => apply(words, style, debounced), [words, style, debounced]);

  const reset = () => {
    setStyle('camel');
    setInput('');
  };

  const fileName = `${output.split('\n')[0]?.slice(0, 40) || 'converted'}.txt`;

  return (
    <ToolShell
      sidebar={
        <>
          <Field label="Target case">
            <Segmented<Style>
              options={STYLES}
              value={style}
              onChange={setStyle}
            />
          </Field>
          <Notice tone="info" title="How words are detected">
            Boundaries come from spaces, punctuation, and case changes —{' '}
            <span className="mono">HTTPResponse</span> and{' '}
            <span className="mono">http_response</span> both split into{' '}
            <span className="mono">http response</span>. Accented and non-ASCII letters are
            treated as separators, so UPPER/lower case pass the text through untouched instead.
          </Notice>
        </>
      }
      actions={
        <>
          <Button variant="ghost" icon={<RefreshCw />} onClick={reset}>
            Reset
          </Button>
          <CopyButton value={output} />
          <Button
            variant="primary"
            icon={<Download />}
            disabled={!output}
            onClick={() => {
              downloadText(output, fileName);
              toast.success('Downloaded.');
            }}
          >
            Download
          </Button>
        </>
      }
      info={output ? `${formatNumber(words.length)} word(s)` : undefined}
    >
      <div className="grid-2">
        <Panel title="Input">
          <TextArea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Paste text or an identifier to convert…"
            style={{ minHeight: 300 }}
          />
        </Panel>
        <Panel title="Output">
          <TextArea value={output} readOnly placeholder="Converted text appears here." style={{ minHeight: 300 }} />
        </Panel>
      </div>
      {words.length > 0 && (
        <Panel title="Detected words">
          <div className="row-wrap" style={{ gap: 6 }}>
            {words.slice(0, 60).map((w, i) => (
              <span key={i} className="badge mono tiny">
                {w}
              </span>
            ))}
            {words.length > 60 && <span className="dim tiny">+{formatNumber(words.length - 60)} more</span>}
          </div>
        </Panel>
      )}
      <div className="grid-3">
        <Stat label="Words" value={formatNumber(words.length)} />
        <Stat label="Characters in" value={formatNumber(debounced.length)} />
        <Stat label="Characters out" value={formatNumber(output.length)} />
      </div>
    </ToolShell>
  );
}

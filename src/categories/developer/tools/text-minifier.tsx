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
import { formatBytes } from '../../../core/format';

type Lang = 'css' | 'js' | 'json' | 'xml';

const MAX_CHARS = 2_000_000;

const REGEX_ALLOWED_AFTER_KEYWORD = new Set([
  'return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void',
  'do', 'else', 'case', 'yield', 'await', 'throw',
]);

function minifyCss(src: string): string {
  const strings: string[] = [];
  const shielded = src.replace(/"[^"]*"|'[^']*'/g, (s) => {
    strings.push(s);
    return `\u0000${strings.length - 1}\u0000`;
  });
  let out = shielded
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([{}:;,])\s*/g, '$1')
    .replace(/;}/g, '}')
    .trim();
  out = out.replace(/\u0000(\d+)\u0000/g, (_, i: string) => strings[Number(i)] ?? '');
  return out;
}

function minifyJs(src: string): string {
  const out: string[] = [];
  let last = '';
  let lastWord = '';
  let pendingSpace = false;
  let i = 0;
  const n = src.length;

  const emit = (s: string) => {
    if (!s) return;
    if (pendingSpace) {
      const needsSpace =
        (/[\w$]/.test(last) && /^[\w$]/.test(s)) ||
        (last === '+' && s.startsWith('+')) ||
        (last === '-' && s.startsWith('-')) ||
        (last.endsWith('/') && s.startsWith('/*'));
      if (needsSpace) out.push(' ');
      pendingSpace = false;
    }
    out.push(s);
    last = s[s.length - 1];
    const word = /[A-Za-z0-9_$]/.test(last);
    if (!word) lastWord = '';
    else {
      const full = s.match(/[A-Za-z0-9_$]*$/)?.[0] ?? '';
      lastWord = (lastWord + full).slice(-12);
    }
  };

  while (i < n) {
    const ch = src[i];
    if (/\s/.test(ch)) {
      while (i < n && /\s/.test(src[i])) i += 1;
      pendingSpace = true;
      continue;
    }
    if (ch === '/' && src[i + 1] === '/') {
      while (i < n && src[i] !== '\n') i += 1;
      pendingSpace = true;
      continue;
    }
    if (ch === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      const stop = end === -1 ? n : end + 2;
      const text = src.slice(i, stop);
      if (text.startsWith('/*!')) emit(text);
      else pendingSpace = true;
      i = stop;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      let j = i + 1;
      while (j < n && src[j] !== ch) {
        if (src[j] === '\\') j += 1;
        j += 1;
      }
      emit(src.slice(i, Math.min(j + 1, n)));
      i = j + 1;
      continue;
    }
    if (ch === '/') {
      // A '/' opens a regex only in operand position: after a keyword, or after
      // an operator / opening bracket — never after an identifier, ) or ].
      const keywordPos = REGEX_ALLOWED_AFTER_KEYWORD.has(lastWord);
      const valuePos = last !== '' && !/[\w$)\]]/.test(last) && last !== '}';
      if (keywordPos || valuePos) {
        let j = i + 1;
        let inClass = false;
        while (j < n) {
          const c = src[j];
          if (c === '\\') j += 2;
          else if (c === '[') inClass = true;
          else if (c === ']') inClass = false;
          else if (c === '/' && !inClass) break;
          else if (c === '\n') break;
          else j += 1;
        }
        if (j < n && src[j] === '/') {
          let k = j + 1;
          while (k < n && /[a-z]/i.test(src[k])) k += 1;
          emit(src.slice(i, k));
          i = k;
          continue;
        }
      }
    }
    emit(ch);
    i += 1;
  }
  return out.join('').trim();
}

function minifyJson(src: string): string {
  return JSON.stringify(JSON.parse(src));
}

function minifyXml(src: string): string {
  return src
    .replace(/>\s+</g, '><')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export default function TextMinifier() {
  const toast = useToast();
  const [lang, setLang] = useState<Lang>('css');
  const [input, setInput] = useState('');
  const debounced = useDebounced(input, 200);

  const result = useMemo(() => {
    const text = debounced.trim();
    if (!text) return { output: '', error: null as string | null, tooBig: false };
    if (text.length > MAX_CHARS) return { output: '', error: null, tooBig: true };
    try {
      if (lang === 'css') return { output: minifyCss(text), error: null, tooBig: false };
      if (lang === 'js') return { output: minifyJs(text), error: null, tooBig: false };
      if (lang === 'json') return { output: minifyJson(text), error: null, tooBig: false };
      return { output: minifyXml(text), error: null, tooBig: false };
    } catch (error) {
      return { output: '', error: error instanceof Error ? error.message : String(error), tooBig: false };
    }
  }, [debounced, lang]);

  const reset = () => {
    setLang('css');
    setInput('');
  };

  const inBytes = new Blob([debounced]).size;
  const outBytes = new Blob([result.output]).size;
  const saved = inBytes > 0 ? ((inBytes - outBytes) / inBytes) * 100 : 0;
  const ext = lang === 'js' ? 'js' : lang;

  return (
    <ToolShell
      sidebar={
        <>
          <Field label="Language">
            <Segmented<Lang>
              options={[
                { value: 'css', label: 'CSS' },
                { value: 'js', label: 'JS' },
                { value: 'json', label: 'JSON' },
                { value: 'xml', label: 'XML' },
              ]}
              value={lang}
              onChange={setLang}
            />
          </Field>
          <Notice tone="warning" title="Conservative only">
            This removes comments and redundant whitespace. It never renames variables, mangles
            property names or reorders code — a real bundler (esbuild, Terser) shrinks far more.
            Always test the output before shipping it.
          </Notice>
          {lang === 'js' && (
            <Notice tone="info">
              Strings, template literals and regex literals are preserved, but unusual syntax
              (nested template placeholders, division right after a closing brace) can still
              confuse the scanner. Review the result.
            </Notice>
          )}
          {lang === 'css' && (
            <Notice tone="info">
              Quoted values such as <span className="mono">content: "a : b"</span> are protected,
              but <span className="mono">url(…)</span> without quotes is not.
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
              downloadText(result.output, `minified.${ext}`);
              toast.success('Downloaded.');
            }}
          >
            Download
          </Button>
        </>
      }
      info={result.error ? 'Could not process' : result.output ? formatBytes(outBytes) : undefined}
    >
      {result.tooBig && (
        <Notice tone="warning" title="Input too large">
          Minification is limited to {formatBytes(MAX_CHARS)} to keep the page responsive.
        </Notice>
      )}
      <div className="grid-2">
        <Panel title="Input">
          <TextArea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={`Paste ${lang.toUpperCase()} here…`}
            style={{ minHeight: 340 }}
          />
        </Panel>
        <Panel title="Minified">
          {result.error ? (
            <Notice tone="error" title="Could not process">
              <span className="mono tiny">{result.error}</span>
            </Notice>
          ) : (
            <TextArea value={result.output} readOnly style={{ minHeight: 340 }} />
          )}
        </Panel>
      </div>
      <div className="grid-3">
        <Stat label="Input" value={formatBytes(inBytes)} />
        <Stat label="Output" value={result.output ? formatBytes(outBytes) : '—'} />
        <Stat
          label="Saved"
          value={result.output ? `${saved.toFixed(1)}%` : '—'}
          tone={saved > 0 ? 'ok' : 'neutral'}
        />
      </div>
    </ToolShell>
  );
}

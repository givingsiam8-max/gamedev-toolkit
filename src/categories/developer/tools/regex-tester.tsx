import { useMemo, useState, type ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';
import { ToolShell } from '../../../components/ToolShell';
import {
  Badge,
  Button,
  CheckBox,
  CodeBlock,
  CopyButton,
  Field,
  Notice,
  Panel,
  Stat,
  TextArea,
  TextInput,
} from '../../../components/ui';
import { useDebounced } from '../../../core/hooks';
import { formatNumber } from '../../../core/format';

const MAX_PATTERN = 500;
const MAX_MATCHES = 500;

const FLAG_LIST = [
  { flag: 'g', label: 'g — global', hint: 'Find all matches, not just the first.' },
  { flag: 'i', label: 'i — ignore case' },
  { flag: 'm', label: 'm — multiline', hint: '^ and $ match at line boundaries.' },
  { flag: 's', label: 's — dotall', hint: '. also matches newlines.' },
  { flag: 'u', label: 'u — unicode' },
  { flag: 'y', label: 'y — sticky', hint: 'Match only starting at lastIndex.' },
];

const CHEATSHEET = [
  '\\d \\w \\s      digit, word char, whitespace',
  '.  [abc] [^a-z] any char, character class',
  '*  +  ?  {2,5}  repeats',
  '( )  (?: )  (?! ) capture, non-capture, lookahead',
  '(?<name> )       named group',
  '^  $  \\b        start, end, word boundary',
  '|               alternation',
  '$& $1 ${name}   replacement: whole match, group 1, named group',
].join('\n');

interface MatchInfo {
  index: number;
  text: string;
  groups: string[];
  named: Record<string, string>;
}

export default function RegexTester() {
  const [pattern, setPattern] = useState('');
  const [flags, setFlags] = useState('g');
  const [text, setText] = useState('');
  const [replacement, setReplacement] = useState('');
  const debouncedText = useDebounced(text, 200);

  const state = useMemo(() => {
    const empty = { error: null as string | null, matches: [] as MatchInfo[], tooLong: false, compiled: null as RegExp | null };
    if (!pattern) return empty;
    if (pattern.length > MAX_PATTERN) return { ...empty, tooLong: true };
    let re: RegExp;
    try {
      re = new RegExp(pattern, flags);
    } catch (error) {
      return { ...empty, error: error instanceof Error ? error.message : String(error) };
    }
    const scan = flags.includes('g') || flags.includes('y') ? re : new RegExp(re.source, `${flags}g`);
    const matches: MatchInfo[] = [];
    let m: RegExpExecArray | null;
    scan.lastIndex = 0;
    while (matches.length < MAX_MATCHES && (m = scan.exec(debouncedText)) !== null) {
      matches.push({
        index: m.index,
        text: m[0],
        groups: m.slice(1).map((g) => g ?? ''),
        named: { ...(m.groups ?? {}) },
      });
      if (m[0] === '') scan.lastIndex += 1;
    }
    return { error: null, matches, tooLong: false, compiled: re };
  }, [pattern, flags, debouncedText]);

  const toggleFlag = (f: string) =>
    setFlags((cur) => (cur.includes(f) ? cur.split('').filter((c) => c !== f).sort().join('') : [...cur.split(''), f].sort().join('')));

  const highlighted = useMemo(() => {
    if (!debouncedText || state.matches.length === 0) return null;
    const nodes: ReactNode[] = [];
    let cursor = 0;
    state.matches.forEach((m, i) => {
      if (m.index < cursor) return;
      if (m.index > cursor) nodes.push(<span key={`t${i}`}>{debouncedText.slice(cursor, m.index)}</span>);
      if (m.text.length > 0) {
        nodes.push(
          <mark key={`m${i}`} style={{ background: 'rgba(59,130,246,.4)', color: 'inherit', borderRadius: 2 }}>
            {debouncedText.slice(m.index, m.index + m.text.length)}
          </mark>,
        );
      }
      cursor = Math.max(cursor, m.index + m.text.length);
    });
    if (cursor < debouncedText.length) nodes.push(<span key="tail">{debouncedText.slice(cursor)}</span>);
    return nodes;
  }, [debouncedText, state.matches]);

  const preview = useMemo(() => {
    if (!state.compiled || !replacement) return null;
    try {
      return debouncedText.replace(state.compiled, replacement);
    } catch (error) {
      return `Replacement error: ${error instanceof Error ? error.message : String(error)}`;
    }
  }, [state.compiled, replacement, debouncedText]);

  const reset = () => {
    setPattern('');
    setFlags('g');
    setText('');
    setReplacement('');
  };

  return (
    <ToolShell
      sidebar={
        <>
          <Field label="Pattern" hint={`Limited to ${MAX_PATTERN} characters to avoid runaway backtracking.`}>
            <TextInput value={pattern} onChange={(event) => setPattern(event.target.value)} placeholder="\\b(\\w+)\\b" className="mono" />
          </Field>
          <Field label="Flags">
            <div className="stack-sm">
              {FLAG_LIST.map((f) => (
                <CheckBox
                  key={f.flag}
                  checked={flags.includes(f.flag)}
                  onChange={() => toggleFlag(f.flag)}
                  label={<span className="mono">{f.label}</span>}
                  hint={f.hint}
                />
              ))}
            </div>
          </Field>
          <Field label="Replacement" hint="Supports $&, $1, ${name}. Without the g flag only the first match is replaced.">
            <TextInput value={replacement} onChange={(event) => setReplacement(event.target.value)} placeholder="[$1]" className="mono" />
          </Field>
          <Panel title="Cheat sheet">
            <CodeBlock text={CHEATSHEET} maxHeight={220} />
          </Panel>
        </>
      }
      actions={
        <>
          <Button variant="ghost" icon={<RefreshCw />} onClick={reset}>
            Reset
          </Button>
          <CopyButton value={preview ?? ''} label="Copy result" />
        </>
      }
      info={state.error ? 'Invalid pattern' : state.matches.length ? `${formatNumber(state.matches.length)} match(es)` : undefined}
    >
      {state.tooLong && (
        <Notice tone="warning" title="Pattern too long">
          Patterns over {MAX_PATTERN} characters are refused — they can hang the page with catastrophic backtracking.
        </Notice>
      )}
      {state.error && (
        <Notice tone="error" title="Invalid regular expression">
          <span className="mono tiny">{state.error}</span>
        </Notice>
      )}

      <Panel title="Test string">
        <TextArea
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Paste the text to test against…"
          style={{ minHeight: 160 }}
        />
      </Panel>

      {highlighted && (
        <Panel title="Highlighted matches">
          <pre className="mono" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0, fontSize: 13, lineHeight: 1.6 }}>
            {highlighted}
          </pre>
        </Panel>
      )}

      {state.matches.length > 0 && (
        <Panel title={`Matches${state.matches.length >= MAX_MATCHES ? ` (first ${MAX_MATCHES})` : ''}`}>
          <div style={{ maxHeight: 300, overflow: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>At</th>
                  <th>Match</th>
                  <th>Groups</th>
                </tr>
              </thead>
              <tbody>
                {state.matches.slice(0, 50).map((m, i) => (
                  <tr key={i}>
                    <td className="mono dim">{i + 1}</td>
                    <td className="mono dim">{m.index}</td>
                    <td className="mono" style={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {m.text === '' ? <span className="dim">∅ empty</span> : m.text}
                    </td>
                    <td className="mono tiny">
                      {m.groups.map((g, gi) => `${gi + 1}=${g}`).join('  ')}
                      {Object.entries(m.named)
                        .map(([k, v]) => ` ${k}=${v}`)
                        .join('')}
                      {m.groups.length === 0 && Object.keys(m.named).length === 0 && <span className="dim">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {preview !== null && (
        <Panel title="Replace preview" actions={<Badge tone="info">{flags.includes('g') ? `${state.matches.length} replacement(s)` : 'first match only'}</Badge>}>
          <pre className="mono" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0, fontSize: 13, maxHeight: 240, overflow: 'auto' }}>
            {preview}
          </pre>
        </Panel>
      )}

      {state.matches.length > 0 && <Stat label="Matches" value={formatNumber(state.matches.length)} />}
    </ToolShell>
  );
}

import { useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { ToolShell } from '../../../components/ToolShell';
import {
  Button,
  CodeBlock,
  Field,
  Notice,
  Panel,
  Stat,
  TextArea,
} from '../../../components/ui';
import { useDebounced } from '../../../core/hooks';
import { formatBytes } from '../../../core/format';

interface Problem {
  message: string;
  line: number;
  column: number;
}

function locate(text: string, error: unknown): Problem {
  const message = error instanceof Error ? error.message : String(error);
  const lc = /line (\d+) column (\d+)/.exec(message);
  if (lc) return { message, line: Number(lc[1]), column: Number(lc[2]) };
  const pos = /position (\d+)/.exec(message);
  if (pos) {
    const index = Math.min(Number(pos[1]), text.length);
    const before = text.slice(0, index);
    return {
      message,
      line: before.split('\n').length,
      column: index - before.lastIndexOf('\n'),
    };
  }
  return { message, line: 0, column: 0 };
}

function fixTrailingCommas(text: string): string {
  return text.replace(/,\s*([}\]])/g, '$1');
}

function fixSingleQuotes(text: string): string {
  let out = '';
  let quote: string | null = null;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      if (ch === '\\') {
        out += ch + (text[i + 1] ?? '');
        i += 1;
        continue;
      }
      if (ch === quote) {
        quote = null;
        out += '"';
      } else out += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      out += '"';
    } else out += ch;
  }
  return out;
}

function fixUnquotedKeys(text: string): string {
  return text.replace(/([{,]\s*)([A-Za-z_$][A-Za-z0-9_$]*)(\s*:)/g, '$1"$2"$3');
}

export default function JsonValidator() {
  const [input, setInput] = useState('');
  const debounced = useDebounced(input);

  const state = useMemo(() => {
    const text = debounced.trim();
    if (!text) return { problem: null as Problem | null, ok: false, summary: null as string | null };
    try {
      const parsed: unknown = JSON.parse(text);
      const kind = Array.isArray(parsed)
        ? `array with ${parsed.length} item(s)`
        : parsed !== null && typeof parsed === 'object'
          ? `object with ${Object.keys(parsed as object).length} key(s)`
          : `the ${typeof parsed} value`;
      return { problem: null, ok: true, summary: `Valid JSON — top level is ${kind}.` };
    } catch (error) {
      return { problem: locate(debounced, error), ok: false, summary: null };
    }
  }, [debounced]);

  const reset = () => setInput('');

  const problemLine = state.problem && state.problem.line > 0
    ? debounced.split('\n')[state.problem.line - 1] ?? ''
    : null;
  const caret =
    problemLine !== null && state.problem
      ? problemLine + '\n' + ' '.repeat(Math.max(state.problem.column - 1, 0)) + '^'
      : null;

  return (
    <ToolShell
      sidebar={
        <Field label="Common fixes" hint="Each button rewrites the input text — check the diff before trusting it.">
          <div className="stack-sm">
            <Button size="sm" variant="outline" block disabled={!state.problem} onClick={() => setInput(fixTrailingCommas(input))}>
              Remove trailing commas
            </Button>
            <Button size="sm" variant="outline" block disabled={!state.problem} onClick={() => setInput(fixSingleQuotes(input))}>
              Single → double quotes
            </Button>
            <Button size="sm" variant="outline" block disabled={!state.problem} onClick={() => setInput(fixUnquotedKeys(input))}>
              Quote unquoted keys
            </Button>
          </div>
        </Field>
      }
      actions={
        <Button variant="ghost" icon={<RefreshCw />} onClick={reset}>
          Reset
        </Button>
      }
      info={state.ok ? 'Valid' : state.problem ? 'Invalid' : undefined}
    >
      <div className="grid-2">
        <Panel title="Input">
          <TextArea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Paste JSON to validate…"
            style={{ minHeight: 340 }}
          />
        </Panel>
        <Panel title="Result" className="stack">
          {state.ok && state.summary && (
            <>
              <Notice tone="success" title="Valid JSON">
                {state.summary}
              </Notice>
              <Stat label="Size" value={formatBytes(new Blob([debounced]).size)} />
            </>
          )}
          {state.problem && (
            <>
              <Notice tone="error" title="Syntax error">
                <span className="mono tiny">{state.problem.message}</span>
              </Notice>
              {state.problem.line > 0 && (
                <Stat
                  label="Location"
                  value={`line ${state.problem.line}, column ${state.problem.column}`}
                />
              )}
              {caret !== null && <CodeBlock text={caret} maxHeight={160} />}
            </>
          )}
          {!state.ok && !state.problem && (
            <Notice tone="info">Paste JSON on the left to validate it.</Notice>
          )}
        </Panel>
      </div>
    </ToolShell>
  );
}

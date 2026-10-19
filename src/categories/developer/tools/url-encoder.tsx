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
  TextArea,
  useToast,
} from '../../../components/ui';
import { useDebounced } from '../../../core/hooks';
import { downloadText } from '../../../core/files';

type Mode = 'encode' | 'decode';
type Scope = 'component' | 'uri' | 'query';

/** encodeURIComponent leaves these characters alone; "query" mode also keeps the URI delimiters. */
const QUERY_KEEP = /[!'()*]/g;

function encode(text: string, scope: Scope): string {
  if (scope === 'component') return encodeURIComponent(text);
  if (scope === 'uri') return encodeURI(text);
  return encodeURIComponent(text).replace(QUERY_KEEP, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

function decode(text: string, scope: Scope): string {
  if (scope === 'query') return decodeURIComponent(text.replace(/\+/g, ' '));
  return decodeURIComponent(text);
}

export default function UrlEncoder() {
  const toast = useToast();
  const [mode, setMode] = useState<Mode>('encode');
  const [scope, setScope] = useState<Scope>('component');
  const [input, setInput] = useState('');
  const debounced = useDebounced(input, 120);

  const result = useMemo(() => {
    if (!debounced) return { output: '', error: null as string | null };
    try {
      return { output: mode === 'encode' ? encode(debounced, scope) : decode(debounced, scope), error: null };
    } catch {
      return { output: '', error: 'The input contains an incomplete or invalid percent-escape such as "%E9" or "%G1".' };
    }
  }, [debounced, mode, scope]);

  const reset = () => {
    setMode('encode');
    setScope('component');
    setInput('');
  };

  return (
    <ToolShell
      sidebar={
        <>
          <Field label="Direction">
            <Segmented<Mode>
              options={[
                { value: 'encode', label: 'Encode' },
                { value: 'decode', label: 'Decode' },
              ]}
              value={mode}
              onChange={setMode}
            />
          </Field>
          <Field
            label="Scope"
            hint={
              scope === 'component'
                ? 'Encodes everything except letters, digits and - _ . ! ~ * \' ( ). Use for a single value.'
                : scope === 'uri'
                  ? 'Keeps URI delimiters such as : / ? # & = intact. Use for a whole address.'
                  : 'Like Component, but also escapes ! \' ( ) * — safe inside form data. Decoding treats + as a space.'
            }
          >
            <Segmented<Scope>
              options={[
                { value: 'component', label: 'Component' },
                { value: 'uri', label: 'Full URI' },
                { value: 'query', label: 'Query' },
              ]}
              value={scope}
              onChange={setScope}
            />
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
              downloadText(result.output, mode === 'encode' ? 'encoded.txt' : 'decoded.txt');
              toast.success('Downloaded.');
            }}
          >
            Download
          </Button>
        </>
      }
    >
      <div className="grid-2">
        <Panel title={mode === 'encode' ? 'Plain text' : 'Encoded text'}>
          <TextArea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={mode === 'encode' ? 'https://example.com/search?q=hello world' : 'https%3A%2F%2Fexample.com'}
            style={{ minHeight: 280 }}
          />
        </Panel>
        <Panel title={mode === 'encode' ? 'Encoded' : 'Decoded'}>
          {result.error ? (
            <Notice tone="error" title="Could not decode">
              {result.error}
            </Notice>
          ) : (
            <TextArea value={result.output} readOnly style={{ minHeight: 280 }} />
          )}
        </Panel>
      </div>
      <Notice tone="info">
        Encoding uses the browser's built-in URI functions, which work on UTF-8 — non-ASCII text
        becomes multi-byte escapes such as <span className="mono">%C3%A9</span> for é.
      </Notice>
    </ToolShell>
  );
}

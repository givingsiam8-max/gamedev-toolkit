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
  TextArea,
  useToast,
} from '../../../components/ui';
import { useDebounced } from '../../../core/hooks';
import { downloadText } from '../../../core/files';
import { formatBytes } from '../../../core/format';

type Mode = 'encode' | 'decode';

function utf8ToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function base64ToUtf8(input: string): string {
  const binary = atob(input);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

const DATA_URI = /^data:([^;,]*)(;[^,]*)?,/i;

export default function Base64Encoder() {
  const toast = useToast();
  const [mode, setMode] = useState<Mode>('encode');
  const [input, setInput] = useState('');
  const [dataUri, setDataUri] = useState(false);
  const [mime, setMime] = useState('text/plain');
  const [wrap, setWrap] = useState(false);
  const debounced = useDebounced(input, 150);

  const result = useMemo(() => {
    if (!debounced) return { output: '', error: null as string | null };
    try {
      if (mode === 'encode') {
        const b64 = utf8ToBase64(debounced);
        const body = wrap ? (b64.match(/.{1,76}/g) ?? [b64]).join('\n') : b64;
        return { output: dataUri ? `data:${mime};base64,${body}` : body, error: null };
      }
      let payload = debounced.trim();
      const prefix = DATA_URI.exec(payload);
      if (prefix) payload = payload.slice(prefix[0].length);
      const clean = payload.replace(/\s+/g, '');
      if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean) || clean.length % 4 === 1) {
        return { output: '', error: 'The input contains characters that are not valid Base64.' };
      }
      return { output: base64ToUtf8(clean), error: null };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        output: '',
        error:
          mode === 'decode' && /utf-8|fatal|invalid/i.test(message)
            ? 'Decoded bytes are not valid UTF-8 text. This is probably binary data — use the Base64 File Converter instead.'
            : 'The input is not valid Base64.',
      };
    }
  }, [debounced, mode, dataUri, mime, wrap]);

  const reset = () => {
    setMode('encode');
    setInput('');
    setDataUri(false);
    setMime('text/plain');
    setWrap(false);
  };

  const inBytes = new Blob([debounced]).size;
  const outBytes = new Blob([result.output]).size;

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
          {mode === 'encode' && (
            <>
              <CheckBox checked={dataUri} onChange={setDataUri} label="Output as data URI" hint="Wraps the result as data:…;base64,…" />
              {dataUri && (
                <Field label="MIME type">
                  <select className="select" value={mime} onChange={(event) => setMime(event.target.value)}>
                    <option value="text/plain">text/plain</option>
                    <option value="text/html">text/html</option>
                    <option value="text/css">text/css</option>
                    <option value="application/json">application/json</option>
                    <option value="image/svg+xml">image/svg+xml</option>
                  </select>
                </Field>
              )}
              <CheckBox checked={wrap} onChange={setWrap} label="Wrap at 76 characters" hint="MIME-style line wrapping." />
            </>
          )}
          <Notice tone="info">
            Text is encoded as UTF-8 before Base64, so accents and emoji round-trip correctly.
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
              downloadText(result.output, mode === 'encode' ? 'encoded.txt' : 'decoded.txt');
              toast.success('Downloaded.');
            }}
          >
            Download
          </Button>
        </>
      }
      info={result.output ? `${formatBytes(inBytes)} → ${formatBytes(outBytes)}` : undefined}
    >
      <div className="grid-2">
        <Panel title={mode === 'encode' ? 'Text' : 'Base64'}>
          <TextArea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={mode === 'encode' ? 'Type or paste text…' : 'Paste Base64 here (a data: URI prefix is accepted)…'}
            style={{ minHeight: 320 }}
          />
        </Panel>
        <Panel title={mode === 'encode' ? 'Base64' : 'Text'}>
          {result.error ? (
            <Notice tone="error" title="Could not convert">
              {result.error}
            </Notice>
          ) : (
            <TextArea value={result.output} readOnly style={{ minHeight: 320 }} />
          )}
        </Panel>
      </div>
    </ToolShell>
  );
}

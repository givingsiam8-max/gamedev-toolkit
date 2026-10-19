import { useMemo, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { ToolShell } from '../../../components/ToolShell';
import { Button, CheckBox, CopyButton, Field, Notice, Panel, Segmented, Stat, TextArea } from '../../../components/ui';
import { DropZone } from '../../../components/files';
import { downloadText, readAsArrayBuffer } from '../../../core/files';
import { formatBytes } from '../../../core/format';
import { useTask } from '../../../core/hooks';

type Mode = 'encode' | 'decode';

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export default function Base64FileConverter() {
  const [mode, setMode] = useState<Mode>('encode');
  const [dataUri, setDataUri] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [decodeText, setDecodeText] = useState('');
  const encode = useTask<{ text: string; source: number }>();
  const decodeTask = useTask<{ blob: Blob; name: string; bytes: number }>();

  const encodedText = useMemo(() => encode.result?.text ?? '', [encode.result]);

  const onFiles = async (files: File[]) => {
    const f = files[0];
    if (!f) return;
    setFile(f);
    await encode.run(async () => {
      const buffer = new Uint8Array(await readAsArrayBuffer(f));
      const b64 = bytesToBase64(buffer);
      const type = f.type || 'application/octet-stream';
      return { text: dataUri ? `data:${type};base64,${b64}` : b64, source: f.size };
    });
  };

  const decodeFromText = () =>
    decodeTask.run(async () => {
      let payload = decodeText.trim();
      let type = 'application/octet-stream';
      const m = /^data:([^;,]+)?(;[^,]*)?,/.exec(payload);
      if (m) {
        type = m[1] || type;
        payload = payload.slice(m[0].length);
      }
      const clean = payload.replace(/\s+/g, '');
      if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean) || clean.length % 4 === 1) {
        throw new Error('The text is not valid Base64.');
      }
      const binary = atob(clean);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      const ext = type.split('/')[1]?.split('+')[0] ?? 'bin';
      return { blob: new Blob([bytes as BlobPart], { type }), name: `decoded.${ext}`, bytes: bytes.length };
    });

  const reset = () => {
    setMode('encode');
    setDataUri(true);
    setFile(null);
    setDecodeText('');
    encode.reset();
    decodeTask.reset();
  };

  return (
    <ToolShell
      sidebar={
        <>
          <Field label="Direction">
            <Segmented<Mode>
              options={[
                { value: 'encode', label: 'File → Base64' },
                { value: 'decode', label: 'Base64 → File' },
              ]}
              value={mode}
              onChange={setMode}
            />
          </Field>
          {mode === 'encode' && (
            <CheckBox checked={dataUri} onChange={setDataUri} label="Data URI" hint="Adds data:&lt;type&gt;;base64, — ready to paste into CSS or HTML." />
          )}
          <Notice tone="warning" title="Base64 is about 33% larger">
            Embedding a file as Base64 makes it roughly one third bigger. Keep large assets as normal files.
          </Notice>
        </>
      }
      actions={
        <>
          <Button variant="ghost" icon={<RefreshCw />} onClick={reset}>
            Reset
          </Button>
          {mode === 'encode' ? (
            <>
              <CopyButton value={encodedText} label="Copy Base64" />
              <Button
                variant="success"
                icon={<Download />}
                disabled={!encodedText}
                onClick={() => downloadText(encodedText, `${file?.name ?? 'file'}.base64.txt`)}
              >
                Download .txt
              </Button>
            </>
          ) : (
            <>
              <Button variant="primary" loading={decodeTask.running} disabled={!decodeText.trim()} onClick={decodeFromText}>
                Decode
              </Button>
              <Button
                variant="success"
                icon={<Download />}
                disabled={!decodeTask.result}
                onClick={() => decodeTask.result && downloadBlobSafe(decodeTask.result.blob, decodeTask.result.name)}
              >
                Download file
              </Button>
            </>
          )}
        </>
      }
    >
      {mode === 'encode' ? (
        <>
          {!file ? (
            <DropZone onFiles={onFiles} multiple={false} formats={['Any file']} size="lg" title="Drop any file to encode" />
          ) : (
            <Panel title={file.name}>
              {encode.running && <span className="dim tiny">Encoding…</span>}
              {encode.error && <Notice tone="error" title="Could not encode">{encode.error}</Notice>}
              {encode.result && (
                <>
                  <div className="grid-2" style={{ marginBottom: 12 }}>
                    <Stat label="Original" value={formatBytes(encode.result.source)} />
                    <Stat label="Base64" value={formatBytes(encodedText.length)} tone="warn" sub="≈ +33%" />
                  </div>
                  <TextArea value={encodedText} readOnly style={{ minHeight: 220 }} />
                </>
              )}
            </Panel>
          )}
        </>
      ) : (
        <Panel title="Base64 input">
          <TextArea
            value={decodeText}
            onChange={(e) => setDecodeText(e.target.value)}
            placeholder="Paste Base64 text, or a data: URI…"
            style={{ minHeight: 260 }}
          />
          {decodeTask.error && (
            <div style={{ marginTop: 12 }}>
              <Notice tone="error" title="Could not decode">{decodeTask.error}</Notice>
            </div>
          )}
          {decodeTask.result && (
            <div className="grid-2" style={{ marginTop: 12 }}>
              <Stat label="Decoded file" value={decodeTask.result.name} />
              <Stat label="Size" value={formatBytes(decodeTask.result.bytes)} />
            </div>
          )}
        </Panel>
      )}
    </ToolShell>
  );
}

function downloadBlobSafe(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

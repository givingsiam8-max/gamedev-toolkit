import { useMemo, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { ToolShell } from '../../../components/ToolShell';
import { Badge, Button, Field, Notice, Panel, Select, Stat, TextArea } from '../../../components/ui';
import { DropZone } from '../../../components/files';
import { downloadBlob, readAsArrayBuffer } from '../../../core/files';
import { formatBytes } from '../../../core/format';
import { UserError } from '../../../core/errors';

const ENCODINGS = [
  { value: 'utf-8', label: 'UTF-8' },
  { value: 'utf-16le', label: 'UTF-16 LE' },
  { value: 'utf-16be', label: 'UTF-16 BE' },
  { value: 'windows-1252', label: 'Windows-1252' },
  { value: 'iso-8859-1', label: 'ISO-8859-1 (Latin-1)' },
];

const MOJIBAKE = /Ã[\u0080-\u00BF]|Â[\u00A0-\u00BF]|â€[\u0080-\u00BF™œ]/;

function bomInfo(bytes: Uint8Array): string {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return 'UTF-8 BOM';
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return 'UTF-16 LE BOM';
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return 'UTF-16 BE BOM';
  return 'No BOM';
}

function hexPreview(bytes: Uint8Array, n = 16): string {
  return Array.from(bytes.subarray(0, n), (b) => b.toString(16).padStart(2, '0')).join(' ');
}

export default function TextEncodingConverter() {
  const [file, setFile] = useState<File | null>(null);
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [source, setSource] = useState('utf-8');
  const [target, setTarget] = useState('utf-8');
  const [error, setError] = useState<string | null>(null);

  const decoded = useMemo(() => {
    if (!bytes) return null;
    try {
      return new TextDecoder(source, { fatal: false }).decode(bytes);
    } catch {
      return null;
    }
  }, [bytes, source]);

  const mojibake = decoded !== null && MOJIBAKE.test(decoded);

  const onFiles = async (files: File[]) => {
    const f = files[0];
    if (!f) return;
    try {
      const buf = new Uint8Array(await readAsArrayBuffer(f));
      setBytes(buf);
      setFile(f);
      setError(null);
      const hasBom = bomInfo(buf);
      if (hasBom.startsWith('UTF-16 LE')) setSource('utf-16le');
      else if (hasBom.startsWith('UTF-16 BE')) setSource('utf-16be');
      else if (hasBom === 'UTF-8 BOM') setSource('utf-8');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read the file.');
    }
  };

  const convert = () => {
    if (decoded === null || !file) {
      setError('Choose a file and a valid source encoding first.');
      return;
    }
    try {
      const encoded = encodeText(decoded, target);
      const name = file.name.replace(/(\.[^.]+)?$/, `.${target}.txt`);
      downloadBlob(new Blob([encoded as BlobPart]), name);
    } catch (e) {
      setError(e instanceof UserError ? e.message : 'Could not re-encode this text.');
    }
  };

  const reset = () => {
    setFile(null);
    setBytes(null);
    setSource('utf-8');
    setTarget('utf-8');
    setError(null);
  };

  return (
    <ToolShell
      sidebar={
        <>
          <Field label="Source encoding" hint="Auto-selected from a byte-order mark when one is present.">
            <Select value={source} onChange={(e) => setSource(e.target.value)} options={ENCODINGS} />
          </Field>
          <Field label="Save as">
            <Select value={target} onChange={(e) => setTarget(e.target.value)} options={ENCODINGS} />
          </Field>
          <Notice tone="info" title="Lossy targets">
            Characters that the target encoding cannot represent are replaced with “?”. Windows-1252 and Latin-1 cannot hold most non-European scripts.
          </Notice>
        </>
      }
      actions={
        <>
          <Button variant="ghost" icon={<RefreshCw />} onClick={reset}>
            Reset
          </Button>
          <Button variant="success" icon={<Download />} disabled={!file || decoded === null} onClick={convert}>
            Download converted
          </Button>
        </>
      }
    >
      {!file || !bytes ? (
        <DropZone onFiles={onFiles} multiple={false} formats={['TXT', 'CSV', 'JSON']} size="lg" title="Drop a text file" />
      ) : (
        <>
          <div className="grid-3">
            <Stat label="File" value={file.name} sub={formatBytes(file.size)} />
            <Stat label="Byte order mark" value={bomInfo(bytes)} />
            <Stat label="Lines" value={decoded ? String(decoded.split(/\r?\n/).length) : '—'} />
          </div>

          <Panel title="First bytes" actions={<Badge tone="neutral">hex</Badge>}>
            <code className="mono tiny" style={{ color: 'var(--text-1)', wordBreak: 'break-word' }}>
              {hexPreview(bytes, 32)}
            </code>
          </Panel>

          {mojibake && (
            <Notice tone="warning" title="Possible mojibake">
              This text contains sequences like “Ã©” or “â€™”, which usually mean UTF-8 bytes were read as a single-byte encoding. Try a different source encoding.
            </Notice>
          )}
          {error && <Notice tone="error" title="Could not convert">{error}</Notice>}

          <Panel title="Preview (decoded)">
            {decoded === null ? (
              <Notice tone="error">The chosen source encoding could not decode this file.</Notice>
            ) : (
              <TextArea value={decoded.slice(0, 20000)} readOnly style={{ minHeight: 240 }} />
            )}
          </Panel>
        </>
      )}
    </ToolShell>
  );
}

function encodeText(text: string, encoding: string): Uint8Array {
  if (encoding === 'utf-8') return new TextEncoder().encode(text);
  if (encoding === 'utf-16le' || encoding === 'utf-16be') {
    const out = new Uint8Array(text.length * 2 + 2);
    const le = encoding === 'utf-16le';
    out[0] = le ? 0xff : 0xfe;
    out[1] = le ? 0xfe : 0xff;
    for (let i = 0; i < text.length; i += 1) {
      const code = text.charCodeAt(i);
      const at = 2 + i * 2;
      if (le) {
        out[at] = code & 0xff;
        out[at + 1] = code >> 8;
      } else {
        out[at] = code >> 8;
        out[at + 1] = code & 0xff;
      }
    }
    return out;
  }
  // Single-byte targets: code points up to U+00FF map directly (Latin-1);
  // anything beyond is replaced with '?'. Windows-1252 is approximated by the same range.
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    out[i] = code <= 0xff ? code : 0x3f;
  }
  return out;
}

import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { ToolShell } from '../../../components/ToolShell';
import {
  Badge,
  Button,
  CopyField,
  Field,
  Notice,
  Panel,
  Segmented,
  TextArea,
} from '../../../components/ui';
import { DropZone } from '../../../components/files';
import { useTask } from '../../../core/hooks';
import { formatBytes } from '../../../core/format';

type Algo = 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512' | 'CRC32';

const ALGOS: Array<{ value: Algo; label: string }> = [
  { value: 'SHA-256', label: 'SHA-256' },
  { value: 'SHA-1', label: 'SHA-1' },
  { value: 'SHA-384', label: 'SHA-384' },
  { value: 'SHA-512', label: 'SHA-512' },
  { value: 'CRC32', label: 'CRC32' },
];

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): string {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return ((crc ^ 0xffffffff) >>> 0).toString(16).padStart(8, '0');
}

async function digest(algo: Algo, bytes: ArrayBuffer | Uint8Array): Promise<string> {
  if (algo === 'CRC32') return crc32(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
  const buffer = bytes instanceof Uint8Array ? bytes.slice().buffer : bytes;
  const hash = await crypto.subtle.digest(algo, buffer);
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('');
}

interface HashResult {
  label: string;
  bytes: number;
  values: Array<{ algo: Algo; hex: string }>;
}

export default function HashGenerator() {
  const [mode, setMode] = useState<'text' | 'file'>('text');
  const [algo, setAlgo] = useState<Algo>('SHA-256');
  const [text, setText] = useState('');
  const task = useTask<HashResult>();

  const hashText = () =>
    task.run(async () => {
      const bytes = new TextEncoder().encode(text);
      return {
        label: 'Text',
        bytes: bytes.length,
        values: [{ algo, hex: await digest(algo, bytes) }],
      };
    });

  const hashFiles = (files: File[]) =>
    task.run(async (report) => {
      const first = files[0];
      if (!first) throw new Error('Choose a file to hash.');
      report(0.2, 'Reading file');
      const buffer = await first.arrayBuffer();
      report(0.6, 'Hashing');
      const hex = await digest(algo, buffer);
      report(1, 'Done');
      return { label: first.name, bytes: first.size, values: [{ algo, hex }] };
    });

  const reset = () => {
    setMode('text');
    setAlgo('SHA-256');
    setText('');
    task.reset();
  };

  const shown = task.result;

  return (
    <ToolShell
      sidebar={
        <>
          <Field label="Algorithm">
            <Segmented<Algo>
              options={ALGOS}
              value={algo}
              onChange={setAlgo}
            />
          </Field>
          <Notice tone="info">
            SHA-family hashes use the browser's Web Crypto API. CRC32 is a fast integrity check,
            not a security hash — never use it to prove a file is authentic.
          </Notice>
        </>
      }
      actions={
        <Button variant="ghost" icon={<RefreshCw />} onClick={reset}>
          Reset
        </Button>
      }
      info={shown ? `${shown.label} · ${formatBytes(shown.bytes)}` : undefined}
    >
      <Segmented<'text' | 'file'>
        options={[
          { value: 'text', label: 'Text' },
          { value: 'file', label: 'File' },
        ]}
        value={mode}
        onChange={(v) => {
          setMode(v);
          task.reset();
        }}
      />

      {mode === 'text' ? (
        <Panel title="Text">
          <TextArea
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Type or paste text to hash…"
            style={{ minHeight: 160 }}
          />
          <div className="row" style={{ marginTop: 10 }}>
            <Button variant="primary" onClick={hashText} disabled={!text || task.running}>
              Hash text
            </Button>
          </div>
        </Panel>
      ) : (
        <DropZone onFiles={(files) => void hashFiles(files)} multiple={false} title="Drop a file to hash" hint="The file is read locally and never uploaded." formats={['Any']} />
      )}

      {task.error && (
        <Notice tone="error" title="Could not hash">
          {task.error}
        </Notice>
      )}

      {shown && (
        <Panel title="Result" actions={<Badge tone="accent">{algo}</Badge>}>
          <div className="stack">
            {shown.values.map((v) => (
              <CopyField key={v.algo} label={`${v.algo} · ${shown.label}`} value={v.hex} hint={`${formatBytes(shown.bytes)} hashed`} />
            ))}
          </div>
        </Panel>
      )}
    </ToolShell>
  );
}

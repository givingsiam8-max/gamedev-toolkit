import { useMemo, useState } from 'react';
import { Download, RefreshCw, Sparkles } from 'lucide-react';
import { ToolShell } from '../../../components/ToolShell';
import {
  Button,
  CheckBox,
  CopyButton,
  Field,
  NumberInput,
  Notice,
  Panel,
  Segmented,
  Stat,
  TextArea,
} from '../../../components/ui';
import { downloadText } from '../../../core/files';
import { formatNumber } from '../../../core/format';

type Variant = 'v4' | 'nil';

const MAX_COUNT = 10_000;

function uuidV4(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export default function UuidGenerator() {
  const [variant, setVariant] = useState<Variant>('v4');
  const [count, setCount] = useState(10);
  const [uppercase, setUppercase] = useState(false);
  const [hyphens, setHyphens] = useState(true);
  const [seed, setSeed] = useState(0);

  const values = useMemo(() => {
    const n = Number.isFinite(count) ? Math.min(Math.max(1, Math.floor(count)), MAX_COUNT) : 1;
    const out: string[] = [];
    for (let i = 0; i < n; i += 1) {
      let id = variant === 'nil' ? '00000000-0000-0000-0000-000000000000' : uuidV4();
      if (!hyphens) id = id.replace(/-/g, '');
      if (uppercase) id = id.toUpperCase();
      out.push(id);
    }
    return out;
    // seed forces a fresh batch when the user presses Generate again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant, count, uppercase, hyphens, seed]);

  const text = values.join('\n');

  const reset = () => {
    setVariant('v4');
    setCount(10);
    setUppercase(false);
    setHyphens(true);
    setSeed(0);
  };

  return (
    <ToolShell
      sidebar={
        <>
          <Field label="Type">
            <Segmented<Variant>
              options={[
                { value: 'v4', label: 'Random v4' },
                { value: 'nil', label: 'Nil' },
              ]}
              value={variant}
              onChange={setVariant}
            />
          </Field>
          <Field label="How many" hint={`1 to ${formatNumber(MAX_COUNT)}.`}>
            <NumberInput value={count} min={1} max={MAX_COUNT} onChange={setCount} />
          </Field>
          <CheckBox checked={uppercase} onChange={setUppercase} label="Uppercase" />
          <CheckBox checked={hyphens} onChange={setHyphens} label="Include hyphens" />
          <Notice tone="info" title="Random, not registry-guaranteed">
            v4 values come from the browser's cryptographic random source. They are statistically
            unique; this tool does not check against any registry.
          </Notice>
        </>
      }
      actions={
        <>
          <Button variant="ghost" icon={<RefreshCw />} onClick={reset}>
            Reset
          </Button>
          <Button variant="primary" icon={<Sparkles />} onClick={() => setSeed((s) => s + 1)} disabled={variant === 'nil'}>
            Generate again
          </Button>
          <CopyButton value={text} label="Copy all" />
          <Button variant="success" icon={<Download />} onClick={() => downloadText(text, 'uuids.txt')}>
            Download .txt
          </Button>
        </>
      }
      info={`${formatNumber(values.length)} ID(s)`}
    >
      <Panel title="Generated">
        <TextArea value={text} readOnly style={{ minHeight: 320 }} />
      </Panel>
      <div className="grid-2">
        <Stat label="Length" value={values[0]?.length ?? 0} sub="characters per ID" />
        <Stat label="Count" value={formatNumber(values.length)} />
      </div>
    </ToolShell>
  );
}

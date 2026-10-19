import { useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { ToolShell } from '../../../components/ToolShell';
import {
  Button,
  CheckBox,
  CopyButton,
  Field,
  Notice,
  NumberInput,
  Panel,
  Stat,
  TextArea,
  useToast,
} from '../../../components/ui';
import { downloadText } from '../../../core/files';
import { formatNumber } from '../../../core/format';

const MAX_COUNT = 1000;

function randomHex32(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function hyphenate(hex: string): string {
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export default function GuidGenerator() {
  const toast = useToast();
  const [count, setCount] = useState(10);
  const [upper, setUpper] = useState(false);
  const [hyphens, setHyphens] = useState(false);
  const [values, setValues] = useState<string[]>([]);

  const generate = () => {
    const out: string[] = [];
    for (let i = 0; i < Math.min(count, MAX_COUNT); i += 1) {
      let hex = randomHex32();
      if (hyphens) hex = hyphenate(hex);
      if (upper) hex = hex.toUpperCase();
      out.push(hex);
    }
    setValues(out);
  };

  const reset = () => {
    setValues([]);
    setCount(10);
    setUpper(false);
    setHyphens(false);
  };

  const text = values.join('\n');

  return (
    <ToolShell
      sidebar={
        <>
          <Field label="Count" hint={`Up to ${MAX_COUNT} per batch.`}>
            <NumberInput value={count} onChange={setCount} min={1} max={MAX_COUNT} />
          </Field>
          <CheckBox
            checked={hyphens}
            onChange={setHyphens}
            label="Hyphenated (.NET GUID format)"
            hint="Unity asset GUIDs are 32 plain hex characters without hyphens."
          />
          <CheckBox checked={upper} onChange={setUpper} label="Uppercase" hint="Unity writes lowercase hex." />
          <Notice tone="info">
            These are randomly generated 128-bit values (crypto-grade randomness). They are not
            guaranteed unique across machines — in a Unity project, let the editor assign GUIDs for
            real assets and use this tool for placeholders and testing.
          </Notice>
        </>
      }
      actions={
        <>
          <Button variant="ghost" icon={<RefreshCw />} onClick={reset}>
            Reset
          </Button>
          <Button variant="primary" icon={<RefreshCw />} onClick={generate}>
            Generate
          </Button>
          <CopyButton value={text} label="Copy all" size="md" variant="outline" onCopied={() => toast.success('Copied.')} />
          <Button
            variant="success"
            icon={<Download />}
            disabled={!values.length}
            onClick={() => {
              downloadText(text, 'guids.txt', 'text/plain');
              toast.success(`Saved ${formatNumber(values.length)} GUID(s).`);
            }}
          >
            Download
          </Button>
        </>
      }
      info={values.length ? `${formatNumber(values.length)} GUID(s)` : undefined}
    >
      <Panel title="Generated">
        {values.length ? (
          <TextArea value={text} readOnly style={{ minHeight: 320 }} />
        ) : (
          <div className="dim">Press Generate to create GUIDs.</div>
        )}
      </Panel>
      <div className="grid-2">
        <Stat label="Format" value={hyphens ? '8-4-4-4-12' : '32 hex'} sub={upper ? 'uppercase' : 'lowercase'} />
        <Stat label="Count" value={formatNumber(values.length)} />
      </div>
    </ToolShell>
  );
}
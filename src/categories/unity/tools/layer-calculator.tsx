import { useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { ToolShell } from '../../../components/ToolShell';
import {
  Badge,
  Button,
  CheckBox,
  CopyField,
  Field,
  Notice,
  Panel,
  TextInput,
} from '../../../components/ui';

const BUILTIN = ['Default', 'TransparentFX', 'Ignore Raycast', '', 'Water', 'UI', '', ''];

function bitSet(mask: number, i: number): boolean {
  return Math.floor(mask / 2 ** i) % 2 === 1;
}

export default function LayerCalculator() {
  const [names, setNames] = useState<string[]>(() =>
    Array.from({ length: 32 }, (_, i) => BUILTIN[i] ?? `Layer ${i}`),
  );
  const [selected, setSelected] = useState<boolean[]>(() => Array(32).fill(false));
  const [inverseInput, setInverseInput] = useState('');

  const mask = useMemo(() => {
    let m = 0;
    for (let i = 0; i < 32; i += 1) if (selected[i]) m += 2 ** i;
    return m;
  }, [selected]);

  const dec = mask.toString();
  const hex = `0x${Math.round(mask).toString(16).toUpperCase().padStart(8, '0')}`;
  const bin = Array.from({ length: 32 }, (_, i) => (bitSet(mask, 31 - i) ? '1' : '0')).join('');

  const inverse = useMemo(() => {
    const raw = inverseInput.trim();
    if (!raw) return null;
    const value = /^0x[0-9a-f]+$/i.test(raw) ? parseInt(raw.slice(2), 16) : Number(raw);
    if (!Number.isFinite(value) || value < 0 || value >= 2 ** 32) return { error: 'Enter a decimal or 0x hex value between 0 and 4294967295.' };
    const layers: string[] = [];
    for (let i = 0; i < 32; i += 1) if (bitSet(value, i)) layers.push(`${i} — ${names[i] || '(unnamed)'}`);
    return { value, layers };
  }, [inverseInput, names]);

  const toggle = (i: number) =>
    setSelected((prev) => prev.map((v, idx) => (idx === i ? !v : v)));

  return (
    <ToolShell
      sidebar={
        <>
          <CopyField label="Bitmask (decimal)" value={dec} />
          <CopyField label="Bitmask (hex)" value={hex} />
          <CopyField label="Bitmask (binary)" value={bin} />
          <CopyField label="LayerMask field" value={`[SerializeField] private LayerMask ${'enemyMask'}; // ${dec}`} />
          <Field label="Inverse: paste a mask value" hint="Decimal or 0x hex — lists which layers it includes.">
            <TextInput value={inverseInput} onChange={(e) => setInverseInput(e.target.value)} placeholder="e.g. 192 or 0xC0" className="mono" />
          </Field>
          {inverse && 'error' in inverse && inverse.error && <Notice tone="error">{inverse.error}</Notice>}
          {inverse && !('error' in inverse) && (
            <Panel title={`Mask ${inverse.value}`}>
              {inverse.layers.length ? (
                <div className="stack-sm">
                  {inverse.layers.map((l) => (
                    <div key={l} className="mono tiny">{l}</div>
                  ))}
                </div>
              ) : (
                <div className="dim tiny">Nothing selected (mask 0).</div>
              )}
            </Panel>
          )}
          <Notice tone="info">
            Unity reserves layers 0–7 for built-ins (Default, TransparentFX, Ignore Raycast, Water,
            UI). User layers start at 8. In C#: LayerMask.GetMask(&quot;Player&quot;) or
            1 &lt;&lt; layerNumber.
          </Notice>
        </>
      }
      actions={
        <>
          <Button
            variant="ghost"
            icon={<RefreshCw />}
            onClick={() => {
              setSelected(Array(32).fill(false));
              setInverseInput('');
            }}
          >
            Reset
          </Button>
          <Badge tone="accent">{selected.filter(Boolean).length} layer(s) selected</Badge>
        </>
      }
    >
      <Panel title="Layers" flush>
        <div style={{ maxHeight: 520, overflow: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 48 }}>#</th>
                <th style={{ width: 64 }}>Use</th>
                <th>Name</th>
                <th style={{ width: 90 }}>Bit value</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 32 }, (_, i) => (
                <tr key={i}>
                  <td className="mono dim">{i}</td>
                  <td>
                    <CheckBox checked={selected[i]} onChange={() => toggle(i)} label="" />
                  </td>
                  <td>
                    <TextInput
                      value={names[i]}
                      onChange={(e) => setNames((prev) => prev.map((n, idx) => (idx === i ? e.target.value : n)))}
                      placeholder={i < 8 ? BUILTIN[i] || '(built-in)' : `Layer ${i}`}
                      disabled={i < 8 && !names[i]}
                    />
                  </td>
                  <td className="mono tiny dim">{2 ** i >= 2 ** 31 ? (2 ** i).toExponential(2) : (2 ** i).toLocaleString('en-US')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </ToolShell>
  );
}
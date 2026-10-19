import { useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { ToolShell } from '../../../components/ToolShell';
import { Button, CopyField, Field, NumberInput, Panel, Segmented, SliderField } from '../../../components/ui';

interface V3 { x: number; y: number; z: number }

const fmt = (n: number, d = 6): string => (Object.is(n, -0) ? 0 : n).toFixed(d);
const fv = (v: V3, d = 6): string => `(${fmt(v.x, d)}, ${fmt(v.y, d)}, ${fmt(v.z, d)})`;

const add = (a: V3, b: V3): V3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const sub = (a: V3, b: V3): V3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const scale = (a: V3, s: number): V3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
const dot = (a: V3, b: V3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: V3, b: V3): V3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const mag = (a: V3): number => Math.hypot(a.x, a.y, a.z);
const norm = (a: V3): V3 => {
  const m = mag(a) || 1;
  return scale(a, 1 / m);
};
const lerp = (a: V3, b: V3, t: number): V3 => add(a, scale(sub(b, a), t));
const proj = (a: V3, b: V3): V3 => scale(b, dot(a, b) / (dot(b, b) || 1));
const reflect = (a: V3, n: V3): V3 => sub(a, scale(n, 2 * dot(a, n)));

type Op = 'add' | 'sub' | 'scale' | 'magnitude' | 'normalize' | 'dot' | 'cross' | 'distance' | 'angle' | 'lerp' | 'projection' | 'reflection';

const OPS: Array<{ value: Op; label: string }> = [
  { value: 'add', label: 'A + B' },
  { value: 'sub', label: 'A − B' },
  { value: 'scale', label: 'A × scalar' },
  { value: 'magnitude', label: '|A|' },
  { value: 'normalize', label: 'normalize(A)' },
  { value: 'dot', label: 'dot(A, B)' },
  { value: 'cross', label: 'cross(A, B)' },
  { value: 'distance', label: 'distance(A, B)' },
  { value: 'angle', label: 'angle(A, B)' },
  { value: 'lerp', label: 'lerp(A, B, t)' },
  { value: 'projection', label: 'project A onto B' },
  { value: 'reflection', label: 'reflect A about B' },
];

function VectorInputs({
  label,
  value,
  onChange,
  dim,
}: {
  label: string;
  value: V3;
  onChange: (v: V3) => void;
  dim: 2 | 3;
}) {
  const axes = dim === 2 ? (['x', 'y'] as const) : (['x', 'y', 'z'] as const);
  return (
    <Field label={label}>
      <div className="row">
        {axes.map((axis) => (
          <NumberInput
            key={axis}
            value={value[axis]}
            onChange={(n) => onChange({ ...value, [axis]: n })}
            step={0.1}
            suffix={axis.toUpperCase()}
          />
        ))}
      </div>
    </Field>
  );
}

export default function VectorCalculator() {
  const [dim, setDim] = useState<2 | 3>(3);
  const [a, setA] = useState<V3>({ x: 1, y: 2, z: 3 });
  const [b, setB] = useState<V3>({ x: 4, y: -5, z: 6 });
  const [op, setOp] = useState<Op>('dot');
  const [scalar, setScalar] = useState(2);
  const [t, setT] = useState(0.5);

  const result = useMemo(() => {
    const av = dim === 2 ? { ...a, z: 0 } : a;
    const bv = dim === 2 ? { ...b, z: 0 } : b;
    switch (op) {
      case 'add': return { vector: add(av, bv) };
      case 'sub': return { vector: sub(av, bv) };
      case 'scale': return { vector: scale(av, scalar) };
      case 'magnitude': return { number: mag(av) };
      case 'normalize': return { vector: norm(av) };
      case 'dot': return { number: dot(av, bv) };
      case 'cross': return dim === 2 ? { note: 'Cross product needs 3D.' } : { vector: cross(av, bv) };
      case 'distance': return { number: mag(sub(av, bv)) };
      case 'angle': {
        const denom = mag(av) * mag(bv);
        if (!denom) return { note: 'Zero-length vector: angle undefined.' };
        return { number: (Math.acos(Math.min(1, Math.max(-1, dot(av, bv) / denom))) * 180) / Math.PI, unit: '°' };
      }
      case 'lerp': return { vector: lerp(av, bv, t) };
      case 'projection': return { vector: proj(av, bv) };
      case 'reflection': return { vector: reflect(av, norm(bv)) };
      default: return { note: 'Pick an operation.' };
    }
  }, [dim, a, b, op, scalar, t]);

  const needsB = ['add', 'sub', 'dot', 'cross', 'distance', 'angle', 'lerp', 'projection', 'reflection'].includes(op);
  const needsScalar = op === 'scale';
  const needsT = op === 'lerp';

  return (
    <ToolShell
      sidebar={
        <>
          <Field label="Dimensions">
            <Segmented
              options={[{ value: '2', label: 'Vector2' }, { value: '3', label: 'Vector3' }]}
              value={String(dim)}
              onChange={(v) => setDim(v === '2' ? 2 : 3)}
            />
          </Field>
          <VectorInputs label="A" value={a} onChange={setA} dim={dim} />
          {needsB && <VectorInputs label="B" value={b} onChange={setB} dim={dim} />}
          {needsScalar && <SliderField label="Scalar" value={scalar} min={-10} max={10} step={0.1} onChange={setScalar} format={(v) => fmt(v, 2)} />}
          {needsT && <SliderField label="t" value={t} min={0} max={1} step={0.01} onChange={setT} format={(v) => v.toFixed(2)} />}
          <Field label="Operation">
            <div className="stack-sm">
              {OPS.map((o) => (
                <Button key={o.value} size="sm" variant={op === o.value ? 'primary' : 'outline'} onClick={() => setOp(o.value)} block>
                  {o.label}
                </Button>
              ))}
            </div>
          </Field>
        </>
      }
      actions={
        <>
          <Button
            variant="ghost"
            icon={<RefreshCw />}
            onClick={() => {
              setA({ x: 1, y: 2, z: 3 });
              setB({ x: 4, y: -5, z: 6 });
              setOp('dot');
              setScalar(2);
              setT(0.5);
              setDim(3);
            }}
          >
            Reset
          </Button>
        </>
      }
    >
      <Panel title={`Result — ${OPS.find((o) => o.value === op)?.label}`}>
        {'vector' in result && result.vector ? (
          <div className="stack-sm">
            <CopyField label="Vector" value={fv(result.vector)} />
            <CopyField label="Magnitude" value={fmt(mag(result.vector), 4)} />
            <CopyField label="Normalized" value={fv(norm(result.vector), 4)} />
          </div>
        ) : 'number' in result && result.number !== undefined ? (
          <CopyField label="Value" value={`${fmt(result.number)}${'unit' in result && result.unit ? result.unit : ''}`} />
        ) : (
          <div className="dim">{(result as { note?: string }).note ?? '—'}</div>
        )}
      </Panel>
      <Panel title="Inputs">
        <div className="grid-2">
          <CopyField label="A" value={fv(dim === 2 ? { ...a, z: 0 } : a, 4)} />
          <CopyField label="B" value={fv(dim === 2 ? { ...b, z: 0 } : b, 4)} />
        </div>
      </Panel>
    </ToolShell>
  );
}
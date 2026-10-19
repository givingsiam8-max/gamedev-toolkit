import { useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { ToolShell } from '../../../components/ToolShell';
import {
  Button,
  CopyField,
  Field,
  Notice,
  Panel,
  Segmented,
  SliderField,
  TextInput,
  useToast,
} from '../../../components/ui';
import { hexToRgb } from '../../../core/color';
import { downloadBlob } from '../../../core/files';
import { canvasToBlob, context2d, createCanvas } from '../../../core/image';

type Kind = 'linear' | 'radial' | 'conic';

function cssGradient(kind: Kind, angle: number, a: string, b: string): string {
  if (kind === 'linear') return `linear-gradient(${angle}deg, ${a}, ${b})`;
  if (kind === 'radial') return `radial-gradient(circle, ${a}, ${b})`;
  return `conic-gradient(from ${angle}deg, ${a}, ${b})`;
}

export default function GradientGenerator() {
  const toast = useToast();
  const [kind, setKind] = useState<Kind>('linear');
  const [angle, setAngle] = useState(135);
  const [a, setA] = useState('#0EA5E9');
  const [b, setB] = useState('#8B5CF6');

  const valid = Boolean(hexToRgb(a) && hexToRgb(b));
  const css = valid ? cssGradient(kind, angle, a, b) : '';

  const exportPng = async () => {
    if (!valid) {
      toast.error('Fix the colour values first.');
      return;
    }
    const W = 1920;
    const H = 1080;
    const canvas = createCanvas(W, H);
    const ctx = context2d(canvas);
    const ra = hexToRgb(a)!;
    const rb = hexToRgb(b)!;

    if (kind === 'conic') {
      const image = ctx.createImageData(W, H);
      const data = image.data;
      const cx = W / 2;
      const cy = H / 2;
      for (let y = 0; y < H; y += 1) {
        for (let x = 0; x < W; x += 1) {
          let deg = (Math.atan2(y - cy, x - cx) * 180) / Math.PI + 90 + angle;
          deg = ((deg % 360) + 360) % 360;
          const t = deg / 360;
          const i = (y * W + x) * 4;
          data[i] = Math.round(ra.r + (rb.r - ra.r) * t);
          data[i + 1] = Math.round(ra.g + (rb.g - ra.g) * t);
          data[i + 2] = Math.round(ra.b + (rb.b - ra.b) * t);
          data[i + 3] = 255;
        }
      }
      ctx.putImageData(image, 0, 0);
    } else if (kind === 'radial') {
      const g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) / 2);
      g.addColorStop(0, a);
      g.addColorStop(1, b);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    } else {
      const rad = (angle * Math.PI) / 180;
      const dx = Math.cos(rad);
      const dy = Math.sin(rad);
      const half = Math.abs(W * dx) + Math.abs(H * dy);
      const g = ctx.createLinearGradient(W / 2 - (dx * half) / 2, H / 2 - (dy * half) / 2, W / 2 + (dx * half) / 2, H / 2 + (dy * half) / 2);
      g.addColorStop(0, a);
      g.addColorStop(1, b);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }

    const blob = await canvasToBlob(canvas, 'image/png');
    downloadBlob(blob, `gradient-${kind}.png`);
    toast.success('Exported 1920 × 1080 PNG.');
  };

  const reset = () => {
    setKind('linear');
    setAngle(135);
    setA('#0EA5E9');
    setB('#8B5CF6');
  };

  return (
    <ToolShell
      sidebar={
        <>
          <Field label="Type">
            <Segmented
              options={[
                { value: 'linear', label: 'Linear' },
                { value: 'radial', label: 'Radial' },
                { value: 'conic', label: 'Conic' },
              ]}
              value={kind}
              onChange={(v) => setKind(v)}
            />
          </Field>
          {kind !== 'radial' && (
            <SliderField label="Angle" value={angle} min={0} max={360} onChange={setAngle} format={(v) => `${v}°`} />
          )}
          <Field label="Colour A (start)">
            <div className="row">
              <input type="color" className="input" value={a} onChange={(e) => setA(e.target.value)} style={{ width: 56, padding: 2 }} />
              <TextInput value={a} onChange={(e) => setA(e.target.value)} className="mono" />
            </div>
          </Field>
          <Field label="Colour B (end)">
            <div className="row">
              <input type="color" className="input" value={b} onChange={(e) => setB(e.target.value)} style={{ width: 56, padding: 2 }} />
              <TextInput value={b} onChange={(e) => setB(e.target.value)} className="mono" />
            </div>
          </Field>
          <Notice tone="info">
            Conic gradients are computed per pixel for the PNG export (Canvas 2D has no native conic
            gradient); the live preview uses the browser's CSS implementation.
          </Notice>
        </>
      }
      actions={
        <>
          <Button variant="ghost" icon={<RefreshCw />} onClick={reset}>
            Reset
          </Button>
          <Button variant="success" icon={<Download />} disabled={!valid} onClick={() => void exportPng()}>
            Export PNG
          </Button>
        </>
      }
    >
      {!valid && (
        <Notice tone="error" title="Invalid colours">
          Both stops must be valid hex colours.
        </Notice>
      )}
      <Panel title="Preview">
        <div className="stage" style={{ padding: 0 }}>
          <div
            style={{
              width: '100%',
              height: 320,
              borderRadius: 8,
              background: css || '#222',
            }}
          />
        </div>
      </Panel>
      <Panel title="CSS">
        <div className="stack">
          <CopyField label="background" value={css} />
        </div>
      </Panel>
    </ToolShell>
  );
}

import { useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { ToolShell } from '../../../components/ToolShell';
import { Button, CopyField, Field, Notice, Panel, SliderField, TextInput } from '../../../components/ui';
import { hexToRgb, rgbToHex, rgbToHsv, clamp255, type RGB } from '../../../core/color';
import { formatNumber } from '../../../core/format';

const srgbToLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const linearToSrgb = (c: number): number => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);
const fmt4 = (n: number): string => n.toFixed(4);

const UNITY_UI_COLORS: Array<{ name: string; hex: string }> = [
  { name: 'Unity background', hex: '#C2C2C2' },
  { name: 'Editor dark', hex: '#383838' },
  { name: 'Selection blue', hex: '#2C5D78' },
  { name: 'Error red', hex: '#B00020' },
  { name: 'Warning orange', hex: '#F5A623' },
  { name: 'Success green', hex: '#2E7D32' },
];

export default function UnityColorUtility() {
  const [hex, setHex] = useState('#3B82F6');
  const [alpha, setAlpha] = useState(1);
  const [hdr, setHdr] = useState(1);

  const state = useMemo(() => {
    const parsed = hexToRgb(hex);
    if (!parsed) return null;
    const rgb01: RGB = { r: parsed.r / 255, g: parsed.g / 255, b: parsed.b / 255 };
    const hsv = rgbToHsv(parsed);
    const lin = { r: srgbToLinear(rgb01.r), g: srgbToLinear(rgb01.g), b: srgbToLinear(rgb01.b) };
    const hdrScaled = { r: rgb01.r * hdr, g: rgb01.g * hdr, b: rgb01.b * hdr };
    const luminance = 0.2126 * lin.r + 0.7152 * lin.g + 0.0722 * lin.b;
    return { rgb01, hsv, lin, hdrScaled, luminance, c32: parsed };
  }, [hex, hdr]);

  const setFromChannels = (channel: 'r' | 'g' | 'b', value01: number) => {
    if (!state) return;
    const next = { ...state.rgb01, [channel]: value01 };
    setHex(rgbToHex({ r: clamp255(next.r * 255), g: clamp255(next.g * 255), b: clamp255(next.b * 255) }));
  };

  return (
    <ToolShell
      sidebar={
        <>
          <Field label="HEX" hint="#RGB, #RRGGBB or #RRGGBBAA are accepted.">
            <TextInput value={hex} onChange={(e) => setHex(e.target.value)} className="mono" maxLength={9} />
          </Field>
          {state && (
            <>
              <SliderField label="R (0–1)" value={state.rgb01.r} min={0} max={1} step={0.01} onChange={(v) => setFromChannels('r', v)} format={fmt4} />
              <SliderField label="G (0–1)" value={state.rgb01.g} min={0} max={1} step={0.01} onChange={(v) => setFromChannels('g', v)} format={fmt4} />
              <SliderField label="B (0–1)" value={state.rgb01.b} min={0} max={1} step={0.01} onChange={(v) => setFromChannels('b', v)} format={fmt4} />
            </>
          )}
          <SliderField label="Alpha (0–1)" value={alpha} min={0} max={1} step={0.01} onChange={setAlpha} format={fmt4} />
          <SliderField label="HDR intensity" value={hdr} min={1} max={16} step={0.1} onChange={setHdr} format={(v) => `${v.toFixed(1)}×`} hint="Multiplies the linear colour for emissive / HDR values." />
        </>
      }
      actions={
        <>
          <Button variant="ghost" icon={<RefreshCw />} onClick={() => { setHex('#3B82F6'); setAlpha(1); setHdr(1); }}>
            Reset
          </Button>
        </>
      }
      info={state ? `luminance ${state.luminance.toFixed(3)}` : undefined}
    >
      {!state && <Notice tone="error" title="Invalid hex">Enter a colour like #3B82F6.</Notice>}

      {state && (
        <>
          <div className="row" style={{ alignItems: 'center', gap: 12 }}>
            <div
              className="swatch"
              style={{ width: 64, height: 64, background: `rgba(${state.c32.r},${state.c32.g},${state.c32.b},${alpha})` }}
            />
            <div className="dim tiny">
              Preview uses the alpha slider. HDR intensity is a multiplier on the linear colour —
              values above 1 are not representable in hex, which is why Unity stores HDR colours as
              four floats.
            </div>
          </div>

          <div className="grid-2">
            <Panel title="Unity formats">
              <div className="stack-sm">
                <CopyField label="Color (0–1 float RGBA)" value={`(${fmt4(state.rgb01.r)}, ${fmt4(state.rgb01.g)}, ${fmt4(state.rgb01.b)}, ${fmt4(alpha)})`} />
                <CopyField label="Color32 (0–255 RGBA)" value={`(${formatNumber(state.c32.r)}, ${formatNumber(state.c32.g)}, ${formatNumber(state.c32.b)}, ${formatNumber(clamp255(alpha * 255))})`} />
                <CopyField label="new Color(r, g, b, a)" value={`new Color(${fmt4(state.rgb01.r)}f, ${fmt4(state.rgb01.g)}f, ${fmt4(state.rgb01.b)}f, ${fmt4(alpha)}f);`} />
                <CopyField label="HDR (intensity-scaled linear RGB)" value={`(${fmt4(state.hdrScaled.r)}, ${fmt4(state.hdrScaled.g)}, ${fmt4(state.hdrScaled.b)}) × ${hdr.toFixed(1)}`} />
              </div>
            </Panel>
            <Panel title="Other formats">
              <div className="stack-sm">
                <CopyField label="HEX" value={hexToRgb(hex) ? rgbToHex(state.c32) : '—'} />
                <CopyField label="RGB 0–255" value={`${state.c32.r}, ${state.c32.g}, ${state.c32.b}`} />
                <CopyField label="HSV" value={`(${state.hsv.h.toFixed(1)}°, ${(state.hsv.s * 100).toFixed(1)}%, ${(state.hsv.v * 100).toFixed(1)}%)`} />
                <CopyField label="Linear RGB (gamma-decoded)" value={`(${fmt4(state.lin.r)}, ${fmt4(state.lin.g)}, ${fmt4(state.lin.b)})`} />
                <CopyField label="sRGB ping-pong check" value={(() => {
                  const back = { r: linearToSrgb(state.lin.r), g: linearToSrgb(state.lin.g), b: linearToSrgb(state.lin.b) };
                  const drift = Math.max(Math.abs(back.r - state.rgb01.r), Math.abs(back.g - state.rgb01.g), Math.abs(back.b - state.rgb01.b));
                  return drift < 1e-6 ? 'round-trips exactly' : `drift ${drift.toExponential(2)}`;
                })()} />
              </div>
            </Panel>
          </div>

          <Panel title="Common Unity editor colours">
            <div className="row-wrap">
              {UNITY_UI_COLORS.map((c) => (
                <button
                  key={c.hex}
                  type="button"
                  className="chip"
                  title={`${c.name} ${c.hex}`}
                  onClick={() => setHex(c.hex)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
                >
                  <span className="swatch-sm" style={{ background: c.hex }} />
                  {c.hex}
                </button>
              ))}
            </div>
          </Panel>
        </>
      )}
    </ToolShell>
  );
}
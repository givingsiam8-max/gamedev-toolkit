import { useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { ToolShell } from '../../../components/ToolShell';
import {
  Button,
  CopyField,
  Field,
  Notice,
  Panel,
  SliderField,
  Stat,
  TextInput,
} from '../../../components/ui';
import {
  cmykToRgb,
  formatCmyk,
  formatHsl,
  formatHsv,
  formatRgb,
  formatRgba,
  hexToRgba,
  nearestColorName,
  rgbToCmyk,
  rgbToHex,
  rgbToHsl,
  rgbToHsv,
  rgbaToHex,
} from '../../../core/color';

const clamp255 = (v: number) => Math.max(0, Math.min(255, Math.round(v)));

export default function ColorConverter() {
  const [hex, setHex] = useState('#3B82F6');
  const [alpha, setAlpha] = useState(1);

  const state = useMemo(() => {
    const rgba = hexToRgba(hex);
    if (!rgba) return null;
    const rgb = { r: rgba.r, g: rgba.g, b: rgba.b };
    const hsl = rgbToHsl(rgb);
    const hsv = rgbToHsv(rgb);
    const cmyk = rgbToCmyk(rgb);
    return {
      rgb,
      hsl,
      hsv,
      cmyk,
      hex6: rgbToHex(rgb),
      hex8: rgbaToHex({ ...rgb, a: clamp255(alpha * 255) }),
      name: nearestColorName(rgb),
    };
  }, [hex, alpha]);

  const setChannel = (channel: 'r' | 'g' | 'b', value: number) => {
    if (!state) return;
    const next = { ...state.rgb, [channel]: clamp255(value) };
    setHex(rgbToHex(next));
  };

  const reset = () => {
    setHex('#3B82F6');
    setAlpha(1);
  };

  return (
    <ToolShell
      sidebar={
        <>
          <Field label="Colour picker">
            <div className="row">
              <input
                type="color"
                className="input"
                value={state?.hex6 ?? '#000000'}
                onChange={(event) => setHex(event.target.value)}
                style={{ width: 64, padding: 2 }}
              />
              <TextInput value={hex} onChange={(event) => setHex(event.target.value)} className="mono" />
            </div>
          </Field>
          <SliderField label="Alpha" value={alpha} min={0} max={1} step={0.01} onChange={setAlpha} format={(v) => v.toFixed(2)} />
          {state && (
            <>
              <SliderField label="Red" value={state.rgb.r} min={0} max={255} onChange={(v) => setChannel('r', v)} />
              <SliderField label="Green" value={state.rgb.g} min={0} max={255} onChange={(v) => setChannel('g', v)} />
              <SliderField label="Blue" value={state.rgb.b} min={0} max={255} onChange={(v) => setChannel('b', v)} />
            </>
          )}
          <Button variant="ghost" icon={<RefreshCw />} onClick={reset}>
            Reset
          </Button>
        </>
      }
      actions={<span />}
    >
      {!state ? (
        <Notice tone="error" title="Invalid colour">
          Enter a hex colour such as #3B82F6, #38F or #3B82F6CC.
        </Notice>
      ) : (
        <>
          <div className="row" style={{ alignItems: 'center', gap: 14 }}>
            <div
              className="swatch"
              style={{
                width: 84,
                height: 84,
                background: formatRgba({ ...state.rgb, a: clamp255(alpha * 255) }),
              }}
            />
            <div className="stack-sm">
              <div className="strong">{state.name}</div>
              <div className="dim tiny">Nearest named colour — approximate.</div>
            </div>
          </div>

          <div className="grid-2">
            <Panel title="HEX">
              <div className="stack">
                <CopyField label="HEX (6)" value={state.hex6} />
                <CopyField label="HEX (with alpha)" value={state.hex8} />
              </div>
            </Panel>
            <Panel title="RGB">
              <div className="stack">
                <CopyField label="RGB" value={formatRgb(state.rgb)} />
                <CopyField label="RGBA" value={formatRgba({ ...state.rgb, a: clamp255(alpha * 255) })} />
                <CopyField label="Channels (0–255)" value={`${state.rgb.r}, ${state.rgb.g}, ${state.rgb.b}, ${clamp255(alpha * 255)}`} />
              </div>
            </Panel>
            <Panel title="HSL / HSV">
              <div className="stack">
                <CopyField label="HSL" value={formatHsl(state.hsl)} />
                <CopyField label="HSV" value={formatHsv(state.hsv)} />
                <CopyField label="Hue / Saturation / Lightness" value={`${state.hsl.h.toFixed(1)}, ${state.hsl.s.toFixed(1)}%, ${state.hsl.l.toFixed(1)}%`} />
              </div>
            </Panel>
            <Panel title="CMYK">
              <div className="stack">
                <CopyField label="CMYK" value={formatCmyk(state.cmyk)} />
                <CopyField label="Values" value={`${state.cmyk.c.toFixed(0)}%, ${state.cmyk.m.toFixed(0)}%, ${state.cmyk.y.toFixed(0)}%, ${state.cmyk.k.toFixed(0)}%`} />
                <CopyField
                  label="CMYK → RGB round-trip"
                  value={formatRgb(cmykToRgb(state.cmyk))}
                  hint="Screen CMYK is an approximation; print colour needs a profile."
                />
              </div>
            </Panel>
          </div>

          <div className="grid-3">
            <Stat label="Luminance" value={(0.2126 * state.rgb.r + 0.7152 * state.rgb.g + 0.0722 * state.rgb.b).toFixed(1)} sub="0–255 weighting" />
            <Stat label="Alpha" value={`${Math.round(alpha * 255)} / 255`} />
            <Stat label="Hex length" value={String(state.hex8.length)} sub={state.hex8.length === 9 ? 'with alpha' : 'opaque'} />
          </div>
        </>
      )}
    </ToolShell>
  );
}

import { useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { ToolShell } from '../../../components/ToolShell';
import {
  Badge,
  Button,
  CopyField,
  Field,
  Notice,
  Panel,
  Stat,
  TextInput,
} from '../../../components/ui';
import {
  contrastRatio,
  hexToRgb,
  luminanceToReadableText,
  rgbToHex,
  wcagLevel,
} from '../../../core/color';

export default function ContrastChecker() {
  const [fg, setFg] = useState('#E5E7EB');
  const [bg, setBg] = useState('#0B0E14');

  const state = useMemo(() => {
    const f = hexToRgb(fg);
    const b = hexToRgb(bg);
    if (!f || !b) return null;
    const ratio = contrastRatio(f, b);
    return {
      f,
      b,
      ratio,
      normal: wcagLevel(ratio, false),
      large: wcagLevel(ratio, true),
    };
  }, [fg, bg]);

  const reset = () => {
    setFg('#E5E7EB');
    setBg('#0B0E14');
  };

  const bestForeground = () => {
    const b = hexToRgb(bg);
    if (!b) return;
    const black = { r: 0, g: 0, b: 0 };
    const white = { r: 255, g: 255, b: 255 };
    setFg(rgbToHex(contrastRatio(black, b) >= contrastRatio(white, b) ? black : white));
  };

  const adjust = (which: 'fg' | 'bg', delta: number) => {
    const value = hexToRgb(which === 'fg' ? fg : bg);
    if (!value) return;
    const shift = (n: number) => Math.max(0, Math.min(255, Math.round(n + delta)));
    const next = rgbToHex({ r: shift(value.r), g: shift(value.g), b: shift(value.b) });
    if (which === 'fg') setFg(next);
    else setBg(next);
  };

  return (
    <ToolShell
      sidebar={
        <>
          <Field label="Text colour">
            <div className="row">
              <input type="color" className="input" value={state ? rgbToHex(state.f) : '#000000'} onChange={(e) => setFg(e.target.value)} style={{ width: 56, padding: 2 }} />
              <TextInput value={fg} onChange={(e) => setFg(e.target.value)} className="mono" />
            </div>
          </Field>
          <Field label="Background">
            <div className="row">
              <input type="color" className="input" value={state ? rgbToHex(state.b) : '#000000'} onChange={(e) => setBg(e.target.value)} style={{ width: 56, padding: 2 }} />
              <TextInput value={bg} onChange={(e) => setBg(e.target.value)} className="mono" />
            </div>
          </Field>
          <Field label="Nudge text lightness" hint="Each press shifts all RGB channels equally.">
            <div className="row-wrap">
              <Button size="sm" variant="outline" onClick={() => adjust('fg', -20)}>−20</Button>
              <Button size="sm" variant="outline" onClick={() => adjust('fg', -10)}>−10</Button>
              <Button size="sm" variant="outline" onClick={() => adjust('fg', 10)}>+10</Button>
              <Button size="sm" variant="outline" onClick={() => adjust('fg', 20)}>+20</Button>
            </div>
          </Field>
          <Field label="Nudge background lightness">
            <div className="row-wrap">
              <Button size="sm" variant="outline" onClick={() => adjust('bg', -20)}>−20</Button>
              <Button size="sm" variant="outline" onClick={() => adjust('bg', -10)}>−10</Button>
              <Button size="sm" variant="outline" onClick={() => adjust('bg', 10)}>+10</Button>
              <Button size="sm" variant="outline" onClick={() => adjust('bg', 20)}>+20</Button>
            </div>
          </Field>
          <Button size="sm" variant="outline" onClick={bestForeground}>
            Use best black/white text
          </Button>
          <Notice tone="info">
            WCAG AA needs 4.5:1 for normal text and 3:1 for large text (≥ 24 px, or ≥ 19 px bold).
            AAA needs 7:1.
          </Notice>
        </>
      }
      actions={
        <Button variant="ghost" icon={<RefreshCw />} onClick={reset}>
          Reset
        </Button>
      }
    >
      {!state ? (
        <Notice tone="error" title="Invalid colour">
          Both colours must be valid hex values.
        </Notice>
      ) : (
        <>
          <div className="grid-3">
            <Stat
              label="Contrast ratio"
              value={`${state.ratio.toFixed(2)}:1`}
              tone={state.ratio >= 7 ? 'ok' : state.ratio >= 4.5 ? 'ok' : state.ratio >= 3 ? 'warn' : 'bad'}
            />
            <Stat label="Normal text" value={state.normal} tone={state.normal === 'Fail' ? 'bad' : 'ok'} />
            <Stat label="Large text" value={state.large} tone={state.large === 'Fail' ? 'bad' : 'ok'} />
          </div>

          <Panel title="Preview">
            <div style={{ background: rgbToHex(state.b), padding: 24, borderRadius: 8, color: rgbToHex(state.f) }}>
              <div style={{ fontSize: 13 }}>This is normal body text at 13 px.</div>
              <div style={{ fontSize: 18, marginTop: 10 }}>Larger interface text at 18 px.</div>
              <div style={{ fontSize: 28, fontWeight: 700, marginTop: 12 }}>Heading at 28 px</div>
              <div style={{ fontSize: 12, marginTop: 14, opacity: 0.9 }}>Button label · 36 px tall control</div>
            </div>
          </Panel>

          <div className="grid-2">
            <Panel title="Values">
              <div className="stack">
                <CopyField label="Foreground" value={rgbToHex(state.f)} />
                <CopyField label="Background" value={rgbToHex(state.b)} />
                <CopyField label="Ratio" value={`${state.ratio.toFixed(3)}:1`} />
              </div>
            </Panel>
            <Panel title="Checks">
              <div className="stack-sm">
                <div className="row spread">
                  <span>Normal text (AA 4.5:1)</span>
                  <Badge tone={state.normal === 'Fail' ? 'danger' : 'success'}>{state.normal}</Badge>
                </div>
                <div className="row spread">
                  <span>Large text (AA 3:1)</span>
                  <Badge tone={state.large === 'Fail' ? 'danger' : 'success'}>{state.large}</Badge>
                </div>
                <div className="row spread">
                  <span>AAA (7:1)</span>
                  <Badge tone={state.ratio >= 7 ? 'success' : 'warning'}>{state.ratio >= 7 ? 'Pass' : 'Fail'}</Badge>
                </div>
                <div className="row spread">
                  <span>Readable text on background</span>
                  <span className="mono" style={{ color: rgbToHex(state.b), background: rgbToHex(state.f), padding: '2px 8px', borderRadius: 4 }}>
                    Sample
                  </span>
                </div>
              </div>
            </Panel>
          </div>

          <Notice tone={state.ratio >= 4.5 ? 'success' : 'warning'} title={state.ratio >= 4.5 ? 'Passes AA for normal text' : 'Below AA for normal text'}>
            {state.ratio >= 4.5
              ? `A ratio of ${state.ratio.toFixed(2)}:1 is sufficient for standard UI text.`
              : `Raise the contrast to at least 4.5:1. ${luminanceToReadableText(state.b) === '#FFFFFF' ? 'Use a lighter text colour.' : 'Use a darker text colour.'}`}
          </Notice>
        </>
      )}
    </ToolShell>
  );
}

import { useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { ToolShell } from '../../../components/ToolShell';
import {
  Button,
  CopyField,
  Field,
  NumberInput,
  Notice,
  Panel,
  Select,
  Stat,
} from '../../../components/ui';
import { aspectRatio, gcd } from '../../../core/format';
import { formatNumber } from '../../../core/format';

const PRESETS: Array<{ label: string; ratio: number }> = [
  { label: '16:9', ratio: 16 / 9 },
  { label: '16:10', ratio: 16 / 10 },
  { label: '4:3', ratio: 4 / 3 },
  { label: '21:9', ratio: 21 / 9 },
  { label: '1:1', ratio: 1 },
  { label: '9:16', ratio: 9 / 16 },
  { label: '3:2', ratio: 3 / 2 },
];

const WIDTHS = [640, 1280, 1920, 2560, 3840];

const DISPLAYS: Array<{ label: string; w: number; h: number }> = [
  { label: '1920 × 1080', w: 1920, h: 1080 },
  { label: '2560 × 1440', w: 2560, h: 1440 },
  { label: '3840 × 2160', w: 3840, h: 2160 },
  { label: '1280 × 720', w: 1280, h: 720 },
  { label: '3440 × 1440 (ultrawide)', w: 3440, h: 1440 },
  { label: '1920 × 1200 (16:10)', w: 1920, h: 1200 },
];

export default function AspectRatioCalculator() {
  const [width, setWidth] = useState(1920);
  const [height, setHeight] = useState(1080);
  const [locked, setLocked] = useState(true);
  const [displayIndex, setDisplayIndex] = useState(0);
  const [hfov, setHfov] = useState(60);

  const ratio = width > 0 && height > 0 ? width / height : 0;
  const display = DISPLAYS[displayIndex] ?? DISPLAYS[0];

  const state = useMemo(() => {
    const displayAspect = display.w / display.h;
    let letterbox = 0;
    let pillarbox = 0;
    if (ratio > 0) {
      if (ratio > displayAspect) {
        const contentH = display.w / ratio;
        letterbox = Math.max(0, (display.h - contentH) / 2);
      } else if (ratio < displayAspect) {
        const contentW = display.h * ratio;
        pillarbox = Math.max(0, (display.w - contentW) / 2);
      }
    }
    const vfov = (2 * Math.atan(Math.tan((hfov * Math.PI) / 360) / (ratio || 1)) * 180) / Math.PI;
    return { displayAspect, letterbox, pillarbox, vfov };
  }, [ratio, display, hfov]);

  const onWidth = (value: number) => {
    setWidth(value);
    if (locked && ratio > 0) setHeight(Math.max(1, Math.round(value / ratio)));
  };

  const onHeight = (value: number) => {
    setHeight(value);
    if (locked && ratio > 0) setWidth(Math.max(1, Math.round(value * ratio)));
  };

  const applyPreset = (value: number) => {
    setWidth(Math.round(height * value));
  };

  const reset = () => {
    setWidth(1920);
    setHeight(1080);
    setLocked(true);
    setDisplayIndex(0);
    setHfov(60);
  };

  const divisor = width > 0 && height > 0 ? gcd(width, height) : 1;

  return (
    <ToolShell
      sidebar={
        <>
          <Field label="Width (px)">
            <NumberInput value={width} min={1} max={16384} onChange={onWidth} />
          </Field>
          <Field label="Height (px)">
            <NumberInput value={height} min={1} max={16384} onChange={onHeight} />
          </Field>
          <Field label="Aspect ratio">
            <Select
              value={locked ? 'lock' : 'free'}
              onChange={(e) => setLocked(e.target.value === 'lock')}
              options={[
                { value: 'lock', label: 'Locked to current ratio' },
                { value: 'free', label: 'Free' },
              ]}
            />
          </Field>
          <Field label="Presets" hint="Applies to the current height.">
            <div className="row-wrap" style={{ gap: 6 }}>
              {PRESETS.map((preset) => (
                <Button key={preset.label} size="sm" variant="outline" onClick={() => applyPreset(preset.ratio)}>
                  {preset.label}
                </Button>
              ))}
            </div>
          </Field>
          <Field label="Display target">
            <Select
              value={String(displayIndex)}
              onChange={(e) => setDisplayIndex(Number(e.target.value))}
              options={DISPLAYS.map((d, i) => ({ value: String(i), label: d.label }))}
            />
          </Field>
          <Field label="Horizontal FOV">
            <NumberInput value={hfov} min={1} max={179} onChange={setHfov} suffix="°" />
          </Field>
          <Notice tone="info">
            FOV conversion assumes a rectilinear lens and uses the exact pixel aspect ratio above.
          </Notice>
        </>
      }
      actions={
        <Button variant="ghost" icon={<RefreshCw />} onClick={reset}>
          Reset
        </Button>
      }
    >
      <div className="grid-4">
        <Stat label="Aspect ratio" value={aspectRatio(width, height)} sub={`${(ratio || 0).toFixed(4)} : 1`} />
        <Stat label="Reduced" value={`${width / divisor} : ${height / divisor}`} sub={`gcd ${divisor}`} />
        <Stat label="Megapixels" value={((width * height) / 1_000_000).toFixed(2)} />
        <Stat label="Vertical FOV" value={`${state.vfov.toFixed(1)}°`} sub={`from ${hfov}° horizontal`} />
      </div>

      <div className="grid-2">
        <Panel title="Scale table">
          <table className="table">
            <thead>
              <tr>
                <th>Width</th>
                <th>Height</th>
                <th>Pixels</th>
              </tr>
            </thead>
            <tbody>
              {WIDTHS.map((w) => {
                const h = Math.round(w / (ratio || 1));
                return (
                  <tr key={w}>
                    <td className="mono">{formatNumber(w)}</td>
                    <td className="mono">{formatNumber(h)}</td>
                    <td className="mono dim">{formatNumber(w * h)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>
        <Panel title="Letterbox / pillarbox on display">
          <div className="stack">
            <CopyField
              label={`Content ${aspectRatio(width, height)} on ${display.label}`}
              value={
                state.letterbox > 0
                  ? `${Math.round(state.letterbox)} px bars top and bottom`
                  : state.pillarbox > 0
                    ? `${Math.round(state.pillarbox)} px bars left and right`
                    : 'Fills the display exactly'
              }
            />
            <div className="dim tiny">
              Letterbox adds equal bars top/bottom when content is wider than the display; pillarbox
              adds bars left/right when it is narrower. Values are rounded to whole pixels.
            </div>
          </div>
        </Panel>
      </div>
    </ToolShell>
  );
}

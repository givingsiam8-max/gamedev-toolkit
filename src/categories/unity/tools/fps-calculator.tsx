import { useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { ToolShell } from '../../../components/ToolShell';
import { Button, CopyField, Field, NumberInput, Panel, Segmented, SliderField, Stat } from '../../../components/ui';

const PRESETS = [30, 60, 90, 120, 144] as const;

export default function FpsCalculator() {
  const [target, setTarget] = useState<number>(60);
  const [refresh, setRefresh] = useState<number>(60);
  const [custom, setCustom] = useState(false);

  const state = useMemo(() => {
    const frameMs = 1000 / target;
    const refreshMs = 1000 / refresh;
    const rows = [0.5, 0.75, 0.9, 1].map((frac) => ({
      pct: Math.round(frac * 100),
      ms: frameMs * frac,
    }));
    const fitsIn60 = Math.max(0, Math.floor(refreshMs / frameMs * 100) / 100);
    const droppedPerSecond = target > refresh ? target - refresh : 0;
    return { frameMs, refreshMs, rows, fitsIn60, droppedPerSecond };
  }, [target, refresh]);

  return (
    <ToolShell
      sidebar={
        <>
          <Field label="Target frame rate">
            <Segmented
              options={PRESETS.map((p) => ({ value: String(p), label: `${p} fps` }))}
              value={custom ? 'custom' : String(target)}
              onChange={(v) => {
                if (v === 'custom') setCustom(true);
                else {
                  setCustom(false);
                  setTarget(Number(v));
                }
              }}
            />
          </Field>
          {custom && (
            <Field label="Custom fps">
              <NumberInput value={target} onChange={setTarget} min={1} max={1000} step={1} suffix="fps" />
            </Field>
          )}
          <SliderField label="Display refresh rate" value={refresh} min={24} max={240} step={1} onChange={setRefresh} format={(v) => `${v} Hz`} />
        </>
      }
      actions={
        <>
          <Button
            variant="ghost"
            icon={<RefreshCw />}
            onClick={() => {
              setTarget(60);
              setRefresh(60);
              setCustom(false);
            }}
          >
            Reset
          </Button>
        </>
      }
    >
      <div className="grid-3">
        <Stat label="Frame budget" value={`${state.frameMs.toFixed(3)} ms`} sub={`${target} fps target`} />
        <Stat label="Display period" value={`${state.refreshMs.toFixed(3)} ms`} sub={`${refresh} Hz`} />
        <Stat
          label="Headroom vs display"
          value={target <= refresh ? `${(state.refreshMs - state.frameMs).toFixed(3)} ms` : `−${state.droppedPerSecond} fps`}
          tone={target <= refresh ? 'ok' : 'warn'}
          sub={target <= refresh ? 'every frame can present' : 'frames faster than refresh may be held by vsync'}
        />
      </div>

      <Panel title="Budget breakdown">
        <div style={{ overflow: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Usage of budget</th>
                <th>Milliseconds</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {state.rows.map((r) => (
                <tr key={r.pct}>
                  <td>{r.pct}%</td>
                  <td className="mono">{r.ms.toFixed(3)} ms</td>
                  <td className="dim tiny">
                    {r.pct === 100 ? 'full frame — anything more drops it' : r.pct === 90 ? 'typical safety ceiling' : r.pct === 50 ? 'half the budget for gameplay' : '75% — rendering + logic'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Copyable values">
        <div className="grid-2">
          <CopyField label="ms per frame" value={state.frameMs.toFixed(4)} />
          <CopyField label="Frames per 100 ms" value={((100 / state.frameMs) | 0).toString()} />
          <CopyField label="60 Hz frames per budget" value={state.fitsIn60.toFixed(2)} hint="How many display periods one target frame spans." />
          <CopyField label="Unity Application.targetFrameRate" value={`Application.targetFrameRate = ${target};`} />
        </div>
      </Panel>
    </ToolShell>
  );
}
import { useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { ToolShell } from '../../../components/ToolShell';
import { Button, CopyField, Field, Notice, Panel, SliderField } from '../../../components/ui';
import {
  formatQuat,
  formatVec3,
  rotateVector,
  slerp,
  threeEulerToQuat,
  threeQuatToEuler,
  unityEulerToQuat,
  unityQuatToEuler,
  unityQuatToThreeQuat,
  v3,
  type Quat,
} from '../quat';

function EulerRow({
  label,
  values,
  onChange,
}: {
  label: string;
  values: [number, number, number];
  onChange: (v: [number, number, number]) => void;
}) {
  const axes = ['X', 'Y', 'Z'] as const;
  return (
    <Field label={label}>
      <div className="stack-sm">
        {axes.map((axis, i) => (
          <SliderField
            key={axis}
            label={`${axis} (deg)`}
            value={values[i]}
            min={-360}
            max={360}
            step={1}
            onChange={(n) => {
              const next: [number, number, number] = [...values];
              next[i] = n;
              onChange(next);
            }}
          />
        ))}
      </div>
    </Field>
  );
}

export default function QuaternionConverter() {
  const [unityEuler, setUnityEuler] = useState<[number, number, number]>([30, 45, 60]);
  const [threeEuler, setThreeEuler] = useState<[number, number, number]>([30, 45, 60]);
  const [slerpT, setSlerpT] = useState(0.5);

  const state = useMemo(() => {
    const uq: Quat = unityEulerToQuat(...unityEuler);
    const tq: Quat = threeEulerToQuat(...threeEuler);
    const uqBack = unityQuatToEuler(uq);
    const tqBack = threeQuatToEuler(tq);
    const crossed = unityQuatToThreeQuat(uq);
    const crossedEuler = threeQuatToEuler(crossed);
    const fwdUnity = rotateVector(uq, v3(0, 0, 1));
    const fwdThree = rotateVector(tq, v3(0, 0, 1));
    const mid = slerp(uq, crossed, slerpT);
    return { uq, tq, uqBack, tqBack, crossed, crossedEuler, fwdUnity, fwdThree, mid };
  }, [unityEuler, threeEuler, slerpT]);

  return (
    <ToolShell
      sidebar={
        <>
          <EulerRow label="Unity Euler — left-handed, ZXY" values={unityEuler} onChange={setUnityEuler} />
          <EulerRow label="three.js / glTF Euler — right-handed, XYZ" values={threeEuler} onChange={setThreeEuler} />
          <SliderField label="Slerp t (Unity → converted)" value={slerpT} min={0} max={1} step={0.01} onChange={setSlerpT} format={(v) => v.toFixed(2)} />
        </>
      }
      actions={
        <>
          <Button
            variant="ghost"
            icon={<RefreshCw />}
            onClick={() => {
              setUnityEuler([30, 45, 60]);
              setThreeEuler([30, 45, 60]);
              setSlerpT(0.5);
            }}
          >
            Reset
          </Button>
        </>
      }
    >
      <Notice tone="info" title="Conventions, stated explicitly">
        Unity is left-handed with Euler order ZXY; three.js and glTF are right-handed with order
        XYZ. To express a Unity rotation in the glTF/three frame, mirror the Z axis: the quaternion
        becomes (−x, −y, z, w). Round-tripping through the converter below shows the same physical
        rotation in both frames.
      </Notice>

      <div className="grid-2">
        <Panel title="Unity (LH, ZXY)">
          <div className="stack-sm">
            <CopyField label="Quaternion (x, y, z, w)" value={formatQuat(state.uq)} />
            <CopyField label="Euler round-trip (deg)" value={formatVec3(state.uqBack, 4)} />
            <CopyField label="Forward (0,0,1) rotated" value={formatVec3(state.fwdUnity, 4)} />
          </div>
        </Panel>
        <Panel title="three.js / glTF (RH, XYZ)">
          <div className="stack-sm">
            <CopyField label="Quaternion (x, y, z, w)" value={formatQuat(state.tq)} />
            <CopyField label="Euler round-trip (deg)" value={formatVec3(state.tqBack, 4)} />
            <CopyField label="Forward (0,0,1) rotated" value={formatVec3(state.fwdThree, 4)} />
          </div>
        </Panel>
      </div>

      <Panel title="Cross-conversion & slerp">
        <div className="grid-2">
          <div className="stack-sm">
            <CopyField label="Unity euler → three quaternion" value={formatQuat(state.crossed)} hint="Rule: (−x, −y, z, w) after building the Unity quaternion." />
            <CopyField label="…expressed as three euler (XYZ, deg)" value={formatVec3(state.crossedEuler, 4)} />
          </div>
          <div className="stack-sm">
            <CopyField label={`Slerp(unity, converted, ${slerpT.toFixed(2)})`} value={formatQuat(state.mid)} />
            <div className="dim tiny">
              Slerp interpolates along the shortest arc; both endpoint quaternions are normalised first.
            </div>
          </div>
        </div>
      </Panel>
    </ToolShell>
  );
}
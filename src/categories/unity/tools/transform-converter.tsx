import { useMemo, useState } from 'react';
import { ArrowLeftRight, RefreshCw } from 'lucide-react';
import { ToolShell } from '../../../components/ToolShell';
import { Button, CopyField, Field, Notice, Panel, Segmented, NumberInput } from '../../../components/ui';
import {
  formatQuat,
  formatVec3,
  threeEulerToQuat,
  threeQuatToEuler,
  unityEulerToQuat,
  unityQuatToEuler,
  unityQuatToThreeQuat,
  threeQuatToUnityQuat,
  v3,
} from '../quat';

type Dir = 'unity-three' | 'three-unity';

function Triple({
  label,
  value,
  onChange,
}: {
  label: string;
  value: [number, number, number];
  onChange: (v: [number, number, number]) => void;
}) {
  const axes = ['X', 'Y', 'Z'] as const;
  return (
    <Field label={label}>
      <div className="row">
        {axes.map((axis, i) => (
          <NumberInput
            key={axis}
            value={value[i]}
            step={0.1}
            suffix={axis}
            onChange={(n) => {
              const next: [number, number, number] = [...value];
              next[i] = n;
              onChange(next);
            }}
          />
        ))}
      </div>
    </Field>
  );
}

export default function TransformConverter() {
  const [dir, setDir] = useState<Dir>('unity-three');
  const [pos, setPos] = useState<[number, number, number]>([1, 2, 3]);
  const [rot, setRot] = useState<[number, number, number]>([30, 45, 60]);
  const [scaleV, setScaleV] = useState<[number, number, number]>([1, 1, 1]);

  const out = useMemo(() => {
    if (dir === 'unity-three') {
      const p = v3(pos[0], pos[1], -pos[2]);
      const qu = unityEulerToQuat(rot[0], rot[1], rot[2]);
      const qt = unityQuatToThreeQuat(qu);
      const e = threeQuatToEuler(qt);
      return { p, quat: qt, euler: e, scale: v3(scaleV[0], scaleV[1], scaleV[2]), srcQuat: qu };
    }
    const p = v3(pos[0], pos[1], -pos[2]);
    const qt = threeEulerToQuat(rot[0], rot[1], rot[2]);
    const qu = threeQuatToUnityQuat(qt);
    const e = unityQuatToEuler(qu);
    return { p, quat: qu, euler: e, scale: v3(scaleV[0], scaleV[1], scaleV[2]), srcQuat: qt };
  }, [dir, pos, rot, scaleV]);

  const srcLabel = dir === 'unity-three' ? 'Unity (LH, ZXY euler)' : 'three.js / glTF (RH, XYZ euler)';
  const dstLabel = dir === 'unity-three' ? 'three.js / glTF (RH)' : 'Unity (LH)';

  return (
    <ToolShell
      sidebar={
        <>
          <Field label="Direction">
            <Segmented
              options={[
                { value: 'unity-three', label: 'Unity → three' },
                { value: 'three-unity', label: 'three → Unity' },
              ]}
              value={dir}
              onChange={(v) => setDir(v as Dir)}
            />
          </Field>
          <Triple label={`Position — ${srcLabel}`} value={pos} onChange={setPos} />
          <Triple label={`Rotation (deg) — ${srcLabel}`} value={rot} onChange={setRot} />
          <Triple label="Scale" value={scaleV} onChange={setScaleV} />
        </>
      }
      actions={
        <>
          <Button
            variant="ghost"
            icon={<RefreshCw />}
            onClick={() => {
              setDir('unity-three');
              setPos([1, 2, 3]);
              setRot([30, 45, 60]);
              setScaleV([1, 1, 1]);
            }}
          >
            Reset
          </Button>
          <Button variant="outline" icon={<ArrowLeftRight />} onClick={() => setDir((d) => (d === 'unity-three' ? 'three-unity' : 'unity-three'))}>
            Swap direction
          </Button>
        </>
      }
    >
      <Notice tone="info" title="Exact rule applied">
        Both frames are Y-up; the conversion mirrors the Z axis. Positions: (x, y, z) → (x, y, −z).
        Rotations: build the source-frame quaternion from its Euler order, then negate the X and Y
        components — (x, y, z, w) → (−x, −y, z, w). Scales pass through unchanged. Mirroring Z flips
        triangle winding, so meshes exported this way also need their index buffers flipped (the 3D
        converter handles that part).
      </Notice>

      <Panel title={`Converted — ${dstLabel}`}>
        <div className="grid-2">
          <div className="stack-sm">
            <CopyField label="Position" value={formatVec3(out.p, 4)} />
            <CopyField label="Scale" value={formatVec3(out.scale, 4)} />
          </div>
          <div className="stack-sm">
            <CopyField label="Quaternion (x, y, z, w)" value={formatQuat(out.quat)} />
            <CopyField label="Euler (deg)" value={formatVec3(out.euler, 4)} hint={dir === 'unity-three' ? 'XYZ order, right-handed' : 'ZXY order, left-handed'} />
          </div>
        </div>
      </Panel>

      <Panel title="Source quaternion (for verification)">
        <CopyField label={srcLabel} value={formatQuat(out.srcQuat)} />
        <div className="dim tiny">
          Feed the converted values back with the direction swapped: position, quaternion and scale
          should return to the originals (Euler angles agree modulo 360° and gimbal ambiguity).
        </div>
      </Panel>
    </ToolShell>
  );
}
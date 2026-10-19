import { useMemo, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { ToolShell } from '../../../components/ToolShell';
import {
  Button,
  Field,
  Notice,
  NumberInput,
  Panel,
  Select,
  Stat,
} from '../../../components/ui';
import { DropZone } from '../../../components/files';
import { useObjectUrl, useTask } from '../../../core/hooks';
import { canvasToBlob, context2d, createCanvas, loadImage } from '../../../core/image';
import { downloadBlob } from '../../../core/files';
import { formatBytes, replaceExt } from '../../../core/format';
import { UserError } from '../../../core/errors';

type Ratio = 'free' | '1:1' | '16:9' | '4:3' | '3:2' | '9:16';

const RATIO_VALUES: Record<Ratio, number | null> = {
  free: null,
  '1:1': 1,
  '16:9': 16 / 9,
  '4:3': 4 / 3,
  '3:2': 3 / 2,
  '9:16': 9 / 16,
};

const PRESETS: Array<{ label: string; ratio: Ratio }> = [
  { label: 'Free', ratio: 'free' },
  { label: '1:1 Square', ratio: '1:1' },
  { label: '16:9 Widescreen', ratio: '16:9' },
  { label: '4:3 Classic', ratio: '4:3' },
  { label: '3:2 Photo', ratio: '3:2' },
  { label: '9:16 Vertical', ratio: '9:16' },
];

export default function ImageCropper() {
  const [file, setFile] = useState<File | null>(null);
  const [ratio, setRatio] = useState<Ratio>('free');
  const [x, setX] = useState(0);
  const [y, setY] = useState(0);
  const [w, setW] = useState(0);
  const [h, setH] = useState(0);
  const [dims, setDims] = useState<{ width: number; height: number } | null>(null);
  const previewUrl = useObjectUrl(file);
  const task = useTask<{ blob: Blob; name: string; width: number; height: number }>();

  const loadFile = async (f: File) => {
    setFile(f);
    task.reset();
    const image = await loadImage(f);
    const dw = image.width;
    const dh = image.height;
    image.dispose();
    setDims({ width: dw, height: dh });
    const rv = RATIO_VALUES[ratio];
    if (rv) {
      const cw = Math.min(dw, Math.round(dh * rv));
      const ch = Math.round(cw / rv);
      setW(cw);
      setH(ch);
      setX(Math.round((dw - cw) / 2));
      setY(Math.round((dh - ch) / 2));
    } else {
      setX(0);
      setY(0);
      setW(dw);
      setH(dh);
    }
  };

  const applyRatio = (r: Ratio) => {
    setRatio(r);
    if (!dims) return;
    const rv = RATIO_VALUES[r];
    if (!rv) {
      setX(0);
      setY(0);
      setW(dims.width);
      setH(dims.height);
      return;
    }
    const cw = Math.min(dims.width, Math.round(dims.height * rv));
    const ch = Math.round(cw / rv);
    setW(cw);
    setH(ch);
    setX(Math.round((dims.width - cw) / 2));
    setY(Math.round((dims.height - ch) / 2));
  };

  const clamped = useMemo(() => {
    if (!dims) return { x: 0, y: 0, w: 0, h: 0 };
    const cw = Math.min(w, dims.width);
    const ch = Math.min(h, dims.height);
    return {
      x: Math.max(0, Math.min(x, dims.width - cw)),
      y: Math.max(0, Math.min(y, dims.height - ch)),
      w: cw,
      h: ch,
    };
  }, [x, y, w, h, dims]);

  const run = () =>
    task.run(async () => {
      if (!file) throw new UserError('Add an image first.');
      if (clamped.w <= 0 || clamped.h <= 0) throw new UserError('Crop region has zero size.');
      const image = await loadImage(file);
      try {
        const canvas = createCanvas(clamped.w, clamped.h);
        const ctx = context2d(canvas);
        ctx.drawImage(
          image.source,
          clamped.x,
          clamped.y,
          clamped.w,
          clamped.h,
          0,
          0,
          clamped.w,
          clamped.h,
        );
        const ext = file.name.split('.').pop() ?? 'png';
        const blob = await canvasToBlob(canvas, `image/${ext === 'jpg' ? 'jpeg' : ext}`);
        return { blob, name: replaceExt(file.name, ext), width: clamped.w, height: clamped.h };
      } finally {
        image.dispose();
      }
    });

  const reset = () => {
    setFile(null);
    setDims(null);
    setRatio('free');
    task.reset();
  };

  return (
    <ToolShell
      sidebar={
        <>
          <Field label="Aspect ratio">
            <Select
              options={PRESETS.map((p) => ({ value: p.ratio, label: p.label }))}
              value={ratio}
              onChange={(e) => applyRatio(e.target.value as Ratio)}
            />
          </Field>
          {dims && (
            <>
              <Field label="X (px)">
                <NumberInput value={clamped.x} min={0} max={dims.width - 1} onChange={setX} />
              </Field>
              <Field label="Y (px)">
                <NumberInput value={clamped.y} min={0} max={dims.height - 1} onChange={setY} />
              </Field>
              <Field label="Width (px)">
                <NumberInput value={clamped.w} min={1} max={dims.width} onChange={setW} />
              </Field>
              <Field label="Height (px)">
                <NumberInput value={clamped.h} min={1} max={dims.height} onChange={setH} />
              </Field>
            </>
          )}
        </>
      }
      actions={
        <>
          <Button variant="ghost" icon={<RefreshCw />} onClick={reset}>
            Reset
          </Button>
          <Button variant="primary" loading={task.running} disabled={!file} onClick={run}>
            Crop
          </Button>
          <Button
            variant="success"
            icon={<Download />}
            disabled={!task.result}
            onClick={() => task.result && downloadBlob(task.result.blob, task.result.name)}
          >
            Download
          </Button>
        </>
      }
      info={task.result ? `${task.result.width} × ${task.result.height}` : undefined}
    >
      {!file ? (
        <DropZone
          onFiles={(files) => files[0] && loadFile(files[0])}
          accept="image/*"
          formats={['PNG', 'JPG', 'WebP']}
          size="lg"
          multiple={false}
        />
      ) : (
        <Panel title="Source">
          {previewUrl && (
            <div className="stage" style={{ position: 'relative', overflow: 'hidden' }}>
              <img
                src={previewUrl}
                alt="Source"
                style={{ maxWidth: '100%', maxHeight: 420, objectFit: 'contain', display: 'block' }}
              />
            </div>
          )}
          {dims && (
            <div className="dim tiny" style={{ marginTop: 6 }}>
              {dims.width} × {dims.height} px — crop region: {clamped.w} × {clamped.h} at ({clamped.x}, {clamped.y})
            </div>
          )}
        </Panel>
      )}

      {task.error && (
        <Notice tone="error" title="Could not crop">
          {task.error}
        </Notice>
      )}

      {task.result && (
        <div className="grid-3">
          <Stat label="Output size" value={`${task.result.width} × ${task.result.height}`} />
          <Stat label="File size" value={formatBytes(task.result.blob.size)} />
          <Stat label="Format" value={task.result.name.split('.').pop()?.toUpperCase() ?? '—'} />
        </div>
      )}
    </ToolShell>
  );
}

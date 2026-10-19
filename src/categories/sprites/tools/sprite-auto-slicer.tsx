import { useEffect, useRef, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { ToolShell } from '../../../components/ToolShell';
import {
  Button,
  Field,
  Notice,
  NumberInput,
  Panel,
  ProgressBar,
  SliderField,
  Stat,
  useToast,
} from '../../../components/ui';
import { DropZone } from '../../../components/files';
import { useTask } from '../../../core/hooks';
import { canvasToBlob, context2d, createCanvas, imageToImageData, loadImage, type LoadedImage } from '../../../core/image';
import { downloadBlob, zipFiles } from '../../../core/files';
import { formatNumber, stripExt } from '../../../core/format';
import { UserError } from '../../../core/errors';

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  area: number;
}

function detectRegions(image: LoadedImage, threshold: number, minArea: number): Rect[] {
  const data = imageToImageData(image).data;
  const w = image.width;
  const h = image.height;
  const visited = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  const rects: Rect[] = [];

  const alpha = (index: number) => data[index * 4 + 3];

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const start = y * w + x;
      if (visited[start] || alpha(start) <= threshold) continue;
      let sp = 0;
      stack[sp++] = start;
      visited[start] = 1;
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      let area = 0;

      while (sp > 0) {
        const current = stack[--sp];
        const cy = Math.floor(current / w);
        const cx = current - cy * w;
        area += 1;
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;

        if (cx > 0) {
          const n = current - 1;
          if (!visited[n] && alpha(n) > threshold) {
            visited[n] = 1;
            stack[sp++] = n;
          }
        }
        if (cx < w - 1) {
          const n = current + 1;
          if (!visited[n] && alpha(n) > threshold) {
            visited[n] = 1;
            stack[sp++] = n;
          }
        }
        if (cy > 0) {
          const n = current - w;
          if (!visited[n] && alpha(n) > threshold) {
            visited[n] = 1;
            stack[sp++] = n;
          }
        }
        if (cy < h - 1) {
          const n = current + w;
          if (!visited[n] && alpha(n) > threshold) {
            visited[n] = 1;
            stack[sp++] = n;
          }
        }
      }

      if (area >= minArea) {
        rects.push({ x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1, area });
      }
    }
  }

  // Reading order: top-to-bottom, then left-to-right.
  rects.sort((a, b) => (Math.abs(a.y - b.y) > 12 ? a.y - b.y : a.x - b.x));
  return rects;
}

export default function SpriteAutoSlicer() {
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [threshold, setThreshold] = useState(8);
  const [minArea, setMinArea] = useState(128);
  const [margin, setMargin] = useState(0);
  const [regions, setRegions] = useState<Rect[]>([]);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const imageRef = useRef<LoadedImage | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const task = useTask<{ count: number; total: number }>();

  useEffect(() => () => imageRef.current?.dispose(), []);

  useEffect(() => {
    const image = imageRef.current;
    const canvas = canvasRef.current;
    if (!image || !canvas) return;
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = context2d(canvas);
    ctx.drawImage(image.source, 0, 0);
    ctx.strokeStyle = 'rgba(244,63,94,0.95)';
    ctx.lineWidth = Math.max(1, Math.round(image.width / 700));
    for (const r of regions) {
      ctx.strokeRect(
        Math.max(0, r.x - margin) + 0.5,
        Math.max(0, r.y - margin) + 0.5,
        r.w + margin * 2 - 1,
        r.h + margin * 2 - 1,
      );
    }
  }, [regions, margin]);

  const detect = () =>
    task.run(async () => {
      const image = imageRef.current;
      if (!image) throw new UserError('Add a sprite sheet first.');
      const found = detectRegions(image, threshold, minArea);
      setRegions(found);
      if (!found.length) {
        throw new UserError('No opaque regions found. The sheet may be fully transparent or use a background colour instead of alpha.');
      }
      return { count: found.length, total: found.reduce((sum, r) => sum + r.w * r.h, 0) };
    });

  const exportAll = async () => {
    const image = imageRef.current;
    if (!image || !file || !regions.length) return;
    const base = stripExt(file.name);
    const entries: Array<{ name: string; data: Blob }> = [];
    const jsonFrames: Record<string, unknown> = {};

    for (let i = 0; i < regions.length; i += 1) {
      const r = regions[i];
      const x = Math.max(0, r.x - margin);
      const y = Math.max(0, r.y - margin);
      const w = Math.min(image.width - x, r.w + margin * 2);
      const h = Math.min(image.height - y, r.h + margin * 2);
      const canvas = createCanvas(w, h);
      context2d(canvas).drawImage(image.source, x, y, w, h, 0, 0, w, h);
      const blob = await canvasToBlob(canvas, 'image/png');
      const name = `${base}_${String(i).padStart(3, '0')}`;
      entries.push({ name: `${name}.png`, data: blob });
      jsonFrames[name] = { frame: { x, y, w, h }, sourceSize: { w, h } };
    }

    const json = JSON.stringify({ meta: { image: `${base}-sliced.zip`, count: regions.length }, frames: jsonFrames }, null, 2);
    entries.push({ name: `${base}.json`, data: new Blob([json], { type: 'application/json' }) });
    const zip = await zipFiles(entries);
    downloadBlob(zip, `${base}-auto-sliced.zip`);
    toast.success(`Exported ${formatNumber(regions.length)} sprites.`);
  };

  const onFiles = async (files: File[]) => {
    const f = files[0];
    if (!f) return;
    imageRef.current?.dispose();
    const image = await loadImage(f);
    imageRef.current = image;
    setFile(f);
    setDims({ w: image.width, h: image.height });
    setRegions([]);
    task.reset();
  };

  const reset = () => {
    imageRef.current?.dispose();
    imageRef.current = null;
    setFile(null);
    setDims(null);
    setRegions([]);
    setThreshold(8);
    setMinArea(128);
    setMargin(0);
    task.reset();
  };

  return (
    <ToolShell
      sidebar={
        <>
          <SliderField
            label="Alpha threshold"
            value={threshold}
            min={0}
            max={128}
            onChange={(v) => setThreshold(v)}
            format={(v) => String(v)}
            hint="Pixels above this alpha count as sprite content."
          />
          <Field label="Minimum area (px²)" hint="Filters speckles and compression noise.">
            <NumberInput value={minArea} min={0} max={100000} step={10} onChange={setMinArea} />
          </Field>
          <Field label="Padding around sprites (px)">
            <NumberInput value={margin} min={0} max={16} onChange={setMargin} />
          </Field>
          <Notice tone="info" title="Requires transparency">
            Detection uses connected opaque regions, so the sheet needs an alpha channel. A solid
            background will be detected as one giant sprite.
          </Notice>
        </>
      }
      actions={
        <>
          <Button variant="ghost" icon={<RefreshCw />} onClick={reset}>
            Reset
          </Button>
          <Button variant="primary" loading={task.running} disabled={!file} onClick={detect}>
            Detect sprites
          </Button>
          <Button variant="success" icon={<Download />} disabled={!regions.length} onClick={() => void exportAll()}>
            Export ZIP + JSON
          </Button>
        </>
      }
      info={dims ? `${formatNumber(regions.length)} region(s)` : undefined}
    >
      {!file ? (
        <DropZone
          onFiles={(files) => void onFiles(files)}
          accept="image/*"
          formats={['PNG', 'JPG', 'WebP']}
          size="lg"
          multiple={false}
          title="Drop a sprite sheet with transparency"
        />
      ) : (
        <Panel title="Detected regions">
          <div className="stage checker">
            <canvas ref={canvasRef} style={{ maxWidth: '100%', maxHeight: 520, display: 'block' }} />
          </div>
        </Panel>
      )}

      {task.running && (
        <Panel title="Progress">
          <ProgressBar value={task.progress} label={task.message} />
        </Panel>
      )}
      {task.error && (
        <Notice tone="error" title="Could not detect">
          {task.error}
        </Notice>
      )}
      {regions.length > 0 && (
        <Panel title="Regions" flush>
          <div style={{ maxHeight: 260, overflow: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>X</th>
                  <th>Y</th>
                  <th>W</th>
                  <th>H</th>
                  <th>Area</th>
                </tr>
              </thead>
              <tbody>
                {regions.map((r, i) => (
                  <tr key={i}>
                    <td className="mono dim">{i + 1}</td>
                    <td className="mono tiny">{r.x}</td>
                    <td className="mono tiny">{r.y}</td>
                    <td className="mono tiny">{r.w}</td>
                    <td className="mono tiny">{r.h}</td>
                    <td className="mono tiny">{formatNumber(r.area)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
      {task.result && (
        <div className="grid-2">
          <Stat label="Sprites found" value={formatNumber(task.result.count)} />
          <Stat label="Detected pixels" value={formatNumber(task.result.total)} />
        </div>
      )}
    </ToolShell>
  );
}

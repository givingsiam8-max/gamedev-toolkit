import { useEffect, useRef, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { ToolShell } from '../../../components/ToolShell';
import {
  Button,
  CheckBox,
  Field,
  Notice,
  Panel,
  Segmented,
  Stat,
} from '../../../components/ui';
import { DropZone } from '../../../components/files';
import { useTask } from '../../../core/hooks';
import { canvasToBlob, context2d, createCanvas, loadImage } from '../../../core/image';
import { formatBytes, stripExt } from '../../../core/format';
import { UserError } from '../../../core/errors';

type Zoom = '1' | '2' | '3' | '4';

export default function TilingPreview() {
  const [file, setFile] = useState<File | null>(null);
  const [tiles, setTiles] = useState<Zoom>('3');
  const [checker, setChecker] = useState(true);
  const [info, setInfo] = useState<{ width: number; height: number; output: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const task = useTask<{ blob: Blob; name: string }>();

  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    void (async () => {
      try {
        const image = await loadImage(file);
        if (cancelled) {
          image.dispose();
          return;
        }
        const count = Number(tiles);
        const size = Math.min(4096, image.width * count);
        const height = Math.min(4096, image.height * count);
        const scale = Math.min(size / (image.width * count), height / (image.height * count));
        const canvas = createCanvas(size, height);
        const ctx = context2d(canvas);
        if (checker) {
          const cell = 16;
          for (let y = 0; y < canvas.height; y += cell) {
            for (let x = 0; x < canvas.width; x += cell) {
              ctx.fillStyle = ((x / cell + y / cell) | 0) % 2 === 0 ? '#1b2230' : '#242d3d';
              ctx.fillRect(x, y, cell, cell);
            }
          }
        }
        const drawW = image.width * scale;
        const drawH = image.height * scale;
        for (let y = 0; y < count; y += 1) {
          for (let x = 0; x < count; x += 1) {
            ctx.drawImage(image.source, x * drawW, y * drawH, drawW, drawH);
          }
        }
        if (canvasRef.current) {
          canvasRef.current.width = canvas.width;
          canvasRef.current.height = canvas.height;
          const outCtx = context2d(canvasRef.current);
          outCtx.drawImage(canvas, 0, 0);
        }
        setInfo({ width: image.width, height: image.height, output: count });
        image.dispose();
      } catch {
        /* handled by the empty state */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [file, tiles, checker]);

  const onFiles = (files: File[]) => {
    const f = files[0];
    if (!f) return;
    setFile(f);
    setInfo(null);
    task.reset();
  };

  const reset = () => {
    setFile(null);
    setTiles('3');
    setChecker(true);
    setInfo(null);
    task.reset();
  };

  const exportPng = () =>
    task.run(async () => {
      const canvas = canvasRef.current;
      if (!canvas || !file) throw new UserError('Add a texture first.');
      const blob = await canvasToBlob(canvas, 'image/png');
      return { blob, name: `${stripExt(file.name)}-tiled-${tiles}x.png` };
    });

  return (
    <ToolShell
      sidebar={
        <>
          <Field label="Repeat" hint="How many copies along each axis.">
            <Segmented
              options={[
                { value: '1', label: '1×1' },
                { value: '2', label: '2×2' },
                { value: '3', label: '3×3' },
                { value: '4', label: '4×4' },
              ]}
              value={tiles}
              onChange={(v) => setTiles(v)}
            />
          </Field>
          <CheckBox checked={checker} onChange={setChecker} label="Checkerboard behind" hint="Helps spot transparent gaps." />
          <Notice tone="info" title="What to look for">
            Seams show up as straight lines or repeating bright/dark edges between tiles. This
            preview tiles the texture exactly as a game engine would with Repeat wrapping.
          </Notice>
        </>
      }
      actions={
        <>
          <Button variant="ghost" icon={<RefreshCw />} onClick={reset}>
            Reset
          </Button>
          <Button variant="success" icon={<Download />} disabled={!file} loading={task.running} onClick={exportPng}>
            Export tiled PNG
          </Button>
        </>
      }
      info={info ? `${info.width} × ${info.height}, tiled ${info.output}×` : undefined}
    >
      {!file ? (
        <DropZone
          onFiles={onFiles}
          accept="image/*"
          formats={['PNG', 'JPG', 'WebP']}
          size="lg"
          multiple={false}
          title="Drop a texture to preview tiling"
        />
      ) : (
        <Panel title="Tiling preview">
          <div className="stage">
            <canvas ref={canvasRef} style={{ maxWidth: '100%', maxHeight: 520, display: 'block' }} />
          </div>
          <div className="dim tiny" style={{ marginTop: 6 }}>
            Preview is capped at 4096 px per side; the export uses the same cap.
          </div>
        </Panel>
      )}
      {task.error && (
        <Notice tone="error" title="Could not export">
          {task.error}
        </Notice>
      )}
      {task.result && <Stat label="Tiled PNG" value={formatBytes(task.result.blob.size)} />}
    </ToolShell>
  );
}

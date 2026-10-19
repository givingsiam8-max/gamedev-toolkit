import { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { ToolShell } from '../../../components/ToolShell';
import {
  Button,
  Field,
  Notice,
  NumberInput,
  Panel,
  ProgressBar,
  Stat,
  useToast,
} from '../../../components/ui';
import { DropZone } from '../../../components/files';
import { useTask } from '../../../core/hooks';
import { canvasToBlob, context2d, createCanvas, loadImage, type LoadedImage } from '../../../core/image';
import { downloadBlob, zipFiles } from '../../../core/files';
import { formatBytes, formatNumber, stripExt } from '../../../core/format';
import { UserError } from '../../../core/errors';

interface Slice {
  row: number;
  col: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export default function SpriteSheetSplitter() {
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState(4);
  const [cols, setCols] = useState(4);
  const [padding, setPadding] = useState(0);
  const [margin, setMargin] = useState(0);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const imageRef = useRef<LoadedImage | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const task = useTask<{ count: number; total: number }>();

  useEffect(() => () => imageRef.current?.dispose(), []);

  const grid = (): Slice[] => {
    if (!dims) return [];
    const cellW = Math.floor((dims.w - margin * 2 - Math.max(0, cols - 1) * padding) / cols);
    const cellH = Math.floor((dims.h - margin * 2 - Math.max(0, rows - 1) * padding) / rows);
    if (cellW <= 0 || cellH <= 0) return [];
    const slices: Slice[] = [];
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        slices.push({
          row: r,
          col: c,
          x: margin + c * (cellW + padding),
          y: margin + r * (cellH + padding),
          w: cellW,
          h: cellH,
        });
      }
    }
    return slices;
  };

  useEffect(() => {
    const image = imageRef.current;
    const canvas = canvasRef.current;
    if (!image || !canvas) return;
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = context2d(canvas);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image.source, 0, 0);
    const slices = grid();
    ctx.strokeStyle = 'rgba(59,130,246,0.9)';
    ctx.lineWidth = Math.max(1, Math.round(image.width / 800));
    for (const s of slices) ctx.strokeRect(s.x + 0.5, s.y + 0.5, s.w - 1, s.h - 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, rows, cols, padding, margin, dims]);

  const onFiles = async (files: File[]) => {
    const f = files[0];
    if (!f) return;
    imageRef.current?.dispose();
    const image = await loadImage(f);
    imageRef.current = image;
    setFile(f);
    setDims({ w: image.width, h: image.height });
    task.reset();
  };

  const run = () =>
    task.run(async (report) => {
      const image = imageRef.current;
      if (!image || !file) throw new UserError('Add a sprite sheet first.');
      const slices = grid();
      if (!slices.length) throw new UserError('The padding and margins leave no room for cells. Reduce them.');
      const entries: Array<{ name: string; data: Blob }> = [];
      const base = stripExt(file.name);
      for (let i = 0; i < slices.length; i += 1) {
        const s = slices[i];
        report(i / slices.length, `Slicing ${i + 1}/${slices.length}`);
        const canvas = createCanvas(s.w, s.h);
        context2d(canvas).drawImage(image.source, s.x, s.y, s.w, s.h, 0, 0, s.w, s.h);
        const blob = await canvasToBlob(canvas, 'image/png');
        entries.push({ name: `${base}_r${s.row}_c${s.col}.png`, data: blob });
      }
      report(1, 'Packing ZIP');
      const zip = await zipFiles(entries);
      downloadBlob(zip, `${base}-sliced.zip`);
      toast.success(`Exported ${formatNumber(entries.length)} sprites.`);
      return { count: entries.length, total: entries.reduce((sum, e) => sum + e.data.size, 0) };
    });

  const reset = () => {
    imageRef.current?.dispose();
    imageRef.current = null;
    setFile(null);
    setDims(null);
    setRows(4);
    setCols(4);
    setPadding(0);
    setMargin(0);
    task.reset();
  };

  const slices = grid();
  const cellW = slices[0]?.w ?? 0;
  const cellH = slices[0]?.h ?? 0;

  return (
    <ToolShell
      sidebar={
        <>
          <div className="grid-2">
            <Field label="Rows">
              <NumberInput value={rows} min={1} max={128} onChange={setRows} />
            </Field>
            <Field label="Columns">
              <NumberInput value={cols} min={1} max={128} onChange={setCols} />
            </Field>
          </div>
          <Field label="Padding (px)" hint="Space between cells in the source sheet.">
            <NumberInput value={padding} min={0} max={64} onChange={setPadding} />
          </Field>
          <Field label="Margin (px)" hint="Border around the whole sheet.">
            <NumberInput value={margin} min={0} max={64} onChange={setMargin} />
          </Field>
          {dims && (
            <Notice tone="info">
              Cell size: {cellW} × {cellH} px · {formatNumber(slices.length)} sprites.
            </Notice>
          )}
        </>
      }
      actions={
        <>
          <Button variant="ghost" icon={<RefreshCw />} onClick={reset}>
            Reset
          </Button>
          <Button
            variant="primary"
            loading={task.running}
            disabled={!file || slices.length === 0}
            onClick={run}
          >
            Slice & download ZIP
          </Button>
        </>
      }
      info={dims ? `${dims.w} × ${dims.h}` : undefined}
    >
      {!file ? (
        <DropZone
          onFiles={(files) => void onFiles(files)}
          accept="image/*"
          formats={['PNG', 'JPG', 'WebP']}
          size="lg"
          multiple={false}
          title="Drop a sprite sheet"
        />
      ) : (
        <Panel title="Grid preview">
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
        <Notice tone="error" title="Could not slice">
          {task.error}
        </Notice>
      )}
      {task.result && (
        <div className="grid-3">
          <Stat label="Sprites" value={formatNumber(task.result.count)} />
          <Stat label="ZIP size" value={formatBytes(task.result.total)} />
          <Stat label="Cell" value={`${cellW} × ${cellH}`} />
        </div>
      )}
    </ToolShell>
  );
}

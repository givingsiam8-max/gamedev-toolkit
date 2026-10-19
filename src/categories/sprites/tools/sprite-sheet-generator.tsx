import { useMemo, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { ToolShell } from '../../../components/ToolShell';
import {
  Button,
  Field,
  Notice,
  NumberInput,
  Panel,
  ProgressBar,
  Segmented,
  Stat,
  useToast,
} from '../../../components/ui';
import { DropZone, FileGrid, QueueHeader, useFileQueue } from '../../../components/files';
import { useObjectUrl, useTask } from '../../../core/hooks';
import { canvasToBlob, context2d, createCanvas, loadImage } from '../../../core/image';
import { downloadBlob, zipFiles } from '../../../core/files';
import { formatBytes, formatNumber, stripExt } from '../../../core/format';
import { UserError } from '../../../core/errors';

type CellMode = 'auto' | 'fixed';

interface Region {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  sourceW: number;
  sourceH: number;
}

interface SheetResult {
  blob: Blob;
  width: number;
  height: number;
  columns: number;
  rows: number;
  regions: Region[];
}

export default function SpriteSheetGenerator() {
  const toast = useToast();
  const queue = useFileQueue({ accept: 'image/*', maxFiles: 400 });
  const [mode, setMode] = useState<CellMode>('auto');
  const [columns, setColumns] = useState(0);
  const [cellW, setCellW] = useState(128);
  const [cellH, setCellH] = useState(128);
  const [padding, setPadding] = useState(0);
  const [margin, setMargin] = useState(0);
  const [name, setName] = useState('spritesheet');
  const task = useTask<SheetResult>();
  const previewUrl = useObjectUrl(task.result?.blob ?? null);

  const layout = useMemo(() => {
    const count = queue.items.length;
    if (!count) return null;
    const cols = columns > 0 ? columns : Math.ceil(Math.sqrt(count));
    return { cols, rows: Math.ceil(count / cols) };
  }, [queue.items.length, columns]);

  const run = () =>
    task.run(async (report) => {
      if (!queue.items.length) throw new UserError('Add at least one frame first.');
      const loaded: Array<{ name: string; image: Awaited<ReturnType<typeof loadImage>> }> = [];
      try {
        for (let i = 0; i < queue.items.length; i += 1) {
          const item = queue.items[i];
          report((i / queue.items.length) * 0.4, `Loading ${item.file.name}`);
          loaded.push({ name: item.file.name, image: await loadImage(item.file) });
        }

        const width = mode === 'fixed' ? cellW : Math.max(...loaded.map((l) => l.image.width));
        const height = mode === 'fixed' ? cellH : Math.max(...loaded.map((l) => l.image.height));
        const count = loaded.length;
        const cols = columns > 0 ? columns : Math.ceil(Math.sqrt(count));
        const rows = Math.ceil(count / cols);
        const sheetW = margin * 2 + cols * width + Math.max(0, cols - 1) * padding;
        const sheetH = margin * 2 + rows * height + Math.max(0, rows - 1) * padding;

        const canvas = createCanvas(sheetW, sheetH);
        const ctx = context2d(canvas);
        const regions: Region[] = [];

        for (let i = 0; i < loaded.length; i += 1) {
          const col = i % cols;
          const row = Math.floor(i / cols);
          const cellX = margin + col * (width + padding);
          const cellY = margin + row * (height + padding);
          const frame = loaded[i];
          const scale = Math.min(width / frame.image.width, height / frame.image.height, 1);
          const drawW = Math.max(1, Math.round(frame.image.width * scale));
          const drawH = Math.max(1, Math.round(frame.image.height * scale));
          const dx = cellX + Math.round((width - drawW) / 2);
          const dy = cellY + Math.round((height - drawH) / 2);
          ctx.imageSmoothingEnabled = true;
          ctx.drawImage(frame.image.source, dx, dy, drawW, drawH);
          regions.push({
            name: stripExt(frame.name),
            x: dx,
            y: dy,
            w: drawW,
            h: drawH,
            sourceW: frame.image.width,
            sourceH: frame.image.height,
          });
        }

        report(0.85, 'Encoding sheet');
        const blob = await canvasToBlob(canvas, 'image/png');
        report(1, 'Done');
        return { blob, width: sheetW, height: sheetH, columns: cols, rows, regions };
      } finally {
        for (const l of loaded) l.image.dispose();
      }
    });

  const exportZip = async () => {
    if (!task.result) return;
    const json = JSON.stringify(
      {
        meta: {
          image: `${name || 'spritesheet'}.png`,
          size: { w: task.result.width, h: task.result.height },
          columns: task.result.columns,
          rows: task.result.rows,
          padding,
          margin,
        },
        frames: Object.fromEntries(
          task.result.regions.map((r) => [
            r.name,
            {
              frame: { x: r.x, y: r.y, w: r.w, h: r.h },
              sourceSize: { w: r.sourceW, h: r.sourceH },
            },
          ]),
        ),
      },
      null,
      2,
    );
    const zip = await zipFiles([
      { name: `${name || 'spritesheet'}.png`, data: task.result.blob },
      { name: `${name || 'spritesheet'}.json`, data: json },
    ]);
    downloadBlob(zip, `${name || 'spritesheet'}.zip`);
    toast.success('Sprite sheet and JSON exported.');
  };

  const reset = () => {
    task.reset();
    queue.clear();
  };

  return (
    <ToolShell
      sidebar={
        <>
          <Field label="Sheet name">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Cell size">
            <Segmented
              options={[
                { value: 'auto', label: 'Auto (fit largest)' },
                { value: 'fixed', label: 'Fixed' },
              ]}
              value={mode}
              onChange={(v) => setMode(v)}
            />
          </Field>
          {mode === 'fixed' ? (
            <div className="grid-2">
              <Field label="Cell width">
                <NumberInput value={cellW} min={1} max={2048} onChange={setCellW} />
              </Field>
              <Field label="Cell height">
                <NumberInput value={cellH} min={1} max={2048} onChange={setCellH} />
              </Field>
            </div>
          ) : (
            <Notice tone="info">Cells take the size of the largest frame; smaller frames are centred.</Notice>
          )}
          <Field label="Columns" hint="0 chooses a near-square grid automatically.">
            <NumberInput value={columns} min={0} max={64} onChange={setColumns} />
          </Field>
          <Field label="Padding (px)">
            <NumberInput value={padding} min={0} max={64} onChange={setPadding} />
          </Field>
          <Field label="Margin (px)">
            <NumberInput value={margin} min={0} max={64} onChange={setMargin} />
          </Field>
        </>
      }
      actions={
        <>
          <Button variant="ghost" icon={<RefreshCw />} onClick={reset}>
            Reset
          </Button>
          <Button variant="primary" loading={task.running} disabled={!queue.items.length} onClick={run}>
            Build sheet
          </Button>
          <Button variant="success" icon={<Download />} disabled={!task.result} onClick={() => void exportZip()}>
            PNG + JSON
          </Button>
        </>
      }
      info={layout ? `${layout.cols} × ${layout.rows} grid` : undefined}
    >
      {queue.items.length === 0 ? (
        <DropZone
          onFiles={(files) => queue.add(files)}
          accept="image/*"
          formats={['PNG', 'JPG', 'WebP']}
          size="lg"
          title="Drop animation frames in order"
        />
      ) : (
        <Panel
          title="Frames"
          actions={<QueueHeader count={queue.items.length} label="frames" onClear={queue.clear} />}
        >
          <FileGrid items={queue.items} onRemove={queue.remove} />
        </Panel>
      )}

      {task.running && (
        <Panel title="Progress">
          <ProgressBar value={task.progress} label={task.message} />
        </Panel>
      )}
      {task.error && (
        <Notice tone="error" title="Could not build the sheet">
          {task.error}
        </Notice>
      )}

      {task.result && previewUrl && (
        <>
          <div className="grid-3">
            <Stat label="Sheet size" value={`${formatNumber(task.result.width)} × ${formatNumber(task.result.height)}`} />
            <Stat label="Grid" value={`${task.result.columns} × ${task.result.rows}`} />
            <Stat label="Frames" value={formatNumber(task.result.regions.length)} />
          </div>
          <Panel title="Preview">
            <div className="stage checker">
              <img src={previewUrl} alt="Sprite sheet" style={{ maxWidth: '100%', maxHeight: 480, display: 'block' }} />
            </div>
          </Panel>
          <Stat label="PNG size" value={formatBytes(task.result.blob.size)} />
        </>
      )}
    </ToolShell>
  );
}

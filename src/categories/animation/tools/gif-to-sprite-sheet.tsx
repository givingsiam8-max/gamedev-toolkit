import { useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
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
import { useObjectUrl, useTask } from '../../../core/hooks';
import { canvasToBlob, context2d, createCanvas, imageDataToCanvas } from '../../../core/image';
import { downloadBlob, zipFiles } from '../../../core/files';
import { formatBytes, formatNumber } from '../../../core/format';
import { decodeGif } from '../gif';

interface SheetResult {
  blob: Blob;
  width: number;
  height: number;
  columns: number;
  rows: number;
  count: number;
  json: string;
}

export default function GifToSpriteSheet() {
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [columns, setColumns] = useState(4);
  const [padding, setPadding] = useState(0);
  const [margin, setMargin] = useState(0);
  const [name, setName] = useState('gif-sheet');
  const [gifData, setGifData] = useState<Awaited<ReturnType<typeof decodeGif>> | null>(null);
  const decodeTask = useTask<{ width: number; height: number; frames: number }>();
  const task = useTask<SheetResult>();
  const previewUrl = useObjectUrl(task.result?.blob ?? null);

  const onFiles = async (files: File[]) => {
    const f = files[0];
    if (!f) return;
    setFile(f);
    setGifData(null);
    task.reset();
    await decodeTask.run(async () => {
      const gif = await decodeGif(f);
      setGifData(gif);
      return { width: gif.width, height: gif.height, frames: gif.frames.length };
    });
  };

  const build = () =>
    task.run(async (report) => {
      if (!gifData || !file) throw new Error('Add a GIF first.');
      const cols = Math.max(1, columns);
      const rows = Math.ceil(gifData.frames.length / cols);
      const cellW = gifData.width;
      const cellH = gifData.height;
      const sheetW = margin * 2 + cols * cellW + Math.max(0, cols - 1) * padding;
      const sheetH = margin * 2 + rows * cellH + Math.max(0, rows - 1) * padding;
      const canvas = createCanvas(sheetW, sheetH);
      const ctx = context2d(canvas);
      const frames: Record<string, unknown> = {};

      for (let i = 0; i < gifData.frames.length; i += 1) {
        report(i / gifData.frames.length, `Drawing frame ${i + 1}/${gifData.frames.length}`);
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = margin + col * (cellW + padding);
        const y = margin + row * (cellH + padding);
        ctx.drawImage(imageDataToCanvas(gifData.frames[i].image), x, y);
        frames[`frame_${String(i).padStart(3, '0')}`] = {
          frame: { x, y, w: cellW, h: cellH },
          delay: gifData.frames[i].delay,
        };
      }

      report(0.85, 'Encoding sheet');
      const blob = await canvasToBlob(canvas, 'image/png');
      const json = JSON.stringify(
        {
          meta: {
            image: `${name || 'gif-sheet'}.png`,
            size: { w: sheetW, h: sheetH },
            columns: cols,
            rows,
            frameCount: gifData.frames.length,
          },
          frames,
        },
        null,
        2,
      );
      report(1, 'Done');
      return { blob, width: sheetW, height: sheetH, columns: cols, rows, count: gifData.frames.length, json };
    });

  const exportZip = async () => {
    if (!task.result) return;
    const zip = await zipFiles([
      { name: `${name || 'gif-sheet'}.png`, data: task.result.blob },
      { name: `${name || 'gif-sheet'}.json`, data: task.result.json },
    ]);
    downloadBlob(zip, `${name || 'gif-sheet'}.zip`);
    toast.success('Sprite sheet and JSON exported.');
  };

  const reset = () => {
    setFile(null);
    setGifData(null);
    setColumns(4);
    setPadding(0);
    setMargin(0);
    setName('gif-sheet');
    decodeTask.reset();
    task.reset();
  };

  return (
    <ToolShell
      sidebar={
        <>
          <Field label="Sheet name">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Columns">
            <NumberInput value={columns} min={1} max={64} onChange={setColumns} />
          </Field>
          <Field label="Padding (px)">
            <NumberInput value={padding} min={0} max={64} onChange={setPadding} />
          </Field>
          <Field label="Margin (px)">
            <NumberInput value={margin} min={0} max={64} onChange={setMargin} />
          </Field>
          <Notice tone="info">
            The JSON includes per-frame delays, so an engine can rebuild the original timing from the
            sheet.
          </Notice>
        </>
      }
      actions={
        <>
          <Button variant="ghost" icon={<RefreshCw />} onClick={reset}>
            Reset
          </Button>
          <Button variant="primary" loading={task.running} disabled={!gifData} onClick={build}>
            Build sheet
          </Button>
          <Button variant="success" icon={<Download />} disabled={!task.result} onClick={() => void exportZip()}>
            PNG + JSON
          </Button>
        </>
      }
      info={gifData ? `${formatNumber(gifData.frames.length)} frames` : undefined}
    >
      {!file ? (
        <DropZone
          onFiles={(files) => void onFiles(files)}
          accept="image/gif,.gif"
          formats={['GIF']}
          size="lg"
          multiple={false}
          title="Drop a GIF to convert into a sprite sheet"
        />
      ) : (
        <Panel title={file.name}>
          {decodeTask.running && <div className="dim tiny">Decoding frames…</div>}
          {decodeTask.error && (
            <Notice tone="error" title="Could not decode">
              {decodeTask.error}
            </Notice>
          )}
          {previewUrl ? (
            <div className="stage checker">
              <img src={previewUrl} alt="Sprite sheet" style={{ maxWidth: '100%', maxHeight: 460, display: 'block' }} />
            </div>
          ) : (
            gifData && <div className="dim tiny">Press “Build sheet”.</div>
          )}
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
      {task.result && (
        <div className="grid-4">
          <Stat label="Sheet size" value={`${task.result.width} × ${task.result.height}`} />
          <Stat label="Grid" value={`${task.result.columns} × ${task.result.rows}`} />
          <Stat label="Frames" value={formatNumber(task.result.count)} />
          <Stat label="PNG size" value={formatBytes(task.result.blob.size)} />
        </div>
      )}
    </ToolShell>
  );
}

import { useMemo, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { ToolShell } from '../../../components/ToolShell';
import {
  Button,
  CheckBox,
  Field,
  Notice,
  Panel,
  ProgressBar,
  Select,
  Stat,
  useToast,
} from '../../../components/ui';
import { DropZone, FileGrid, QueueHeader, useFileQueue } from '../../../components/files';
import { useTask } from '../../../core/hooks';
import { canvasToBlob, loadImage, resizeToCanvas, supportedEncodeTypes } from '../../../core/image';
import { downloadBlob, zipFiles } from '../../../core/files';
import { formatBytes, formatNumber, replaceExt } from '../../../core/format';
import { UserError } from '../../../core/errors';

interface ResultFile {
  name: string;
  blob: Blob;
  width: number;
  height: number;
}

export default function TextureResizer() {
  const toast = useToast();
  const queue = useFileQueue({ accept: 'image/*' });
  const [size, setSize] = useState('2048');
  const [keepAspect, setKeepAspect] = useState(true);
  const [nearest, setNearest] = useState(false);
  const [format, setFormat] = useState('image/png');
  const task = useTask<{ files: ResultFile[]; before: number; after: number }>();

  const encoders = useMemo(() => {
    const map = supportedEncodeTypes();
    return new Set(Object.entries(map).filter(([, ok]) => ok).map(([type]) => type));
  }, []);
  const isJpeg = format === 'image/jpeg';

  const run = () =>
    task.run(async (report) => {
      if (!queue.items.length) throw new UserError('Add at least one texture first.');
      const limit = Number(size);
      const files: ResultFile[] = [];
      let before = 0;
      let after = 0;

      for (let i = 0; i < queue.items.length; i += 1) {
        const item = queue.items[i];
        report(i / queue.items.length, `Resizing ${item.file.name}`);
        const image = await loadImage(item.file);
        try {
          let outW = limit;
          let outH = limit;
          if (keepAspect) {
            const scale = Math.min(limit / image.width, limit / image.height);
            outW = Math.max(1, Math.round(image.width * scale));
            outH = Math.max(1, Math.round(image.height * scale));
          }
          const canvas = resizeToCanvas(image, outW, outH, {
            smoothing: !nearest,
            background: isJpeg ? '#000000' : undefined,
          });
          const ext = format === 'image/webp' ? 'webp' : isJpeg ? 'jpg' : 'png';
          const blob = await canvasToBlob(canvas, format, isJpeg ? 0.92 : undefined);
          files.push({ name: replaceExt(item.file.name, ext), blob, width: outW, height: outH });
          before += item.file.size;
          after += blob.size;
        } finally {
          image.dispose();
        }
      }

      report(1, 'Finished');
      return { files, before, after };
    });

  const downloadAll = async () => {
    if (!task.result) return;
    const { files } = task.result;
    if (files.length === 1) downloadBlob(files[0].blob, files[0].name);
    else downloadBlob(await zipFiles(files.map((f) => ({ name: f.name, data: f.blob }))), 'textures.zip');
    toast.success(`Exported ${formatNumber(files.length)} texture(s).`);
  };

  const reset = () => {
    task.reset();
    queue.clear();
  };

  const saved =
    task.result && task.result.before > 0
      ? ((task.result.before - task.result.after) / task.result.before) * 100
      : 0;

  return (
    <ToolShell
      sidebar={
        <>
          <Field label="Max size" hint="Textures are scaled to fit this square; aspect is preserved by default.">
            <Select
              options={['128', '256', '512', '1024', '2048', '4096', '8192'].map((v) => ({ value: v, label: `${v} × ${v}` }))}
              value={size}
              onChange={(event) => {
                setSize(event.target.value);
                task.reset();
              }}
            />
          </Field>
          <CheckBox
            checked={keepAspect}
            onChange={setKeepAspect}
            label="Keep aspect ratio"
            hint="Off forces a square texture, stretching non-square sources."
          />
          <CheckBox
            checked={nearest}
            onChange={setNearest}
            label="Nearest neighbour"
            hint="Prevents blur on pixel-art and hard-edged masks."
          />
          <Field label="Output format">
            <Select
              options={[
                { value: 'image/png', label: 'PNG (lossless, alpha)' },
                { value: 'image/webp', label: 'WebP (smaller, alpha)' },
                { value: 'image/jpeg', label: 'JPG (no alpha)' },
              ].filter((o) => encoders.has(o.value))}
              value={format}
              onChange={(event) => setFormat(event.target.value)}
            />
          </Field>
          <Notice tone="info" title="Power-of-two reminder">
            Every option here is a power of two. Mipmaps and most GPU compression formats expect
            POT textures; NPOT textures may fall back to slower paths or be resized by the engine.
          </Notice>
        </>
      }
      actions={
        <>
          <Button variant="ghost" icon={<RefreshCw />} onClick={reset}>
            Reset
          </Button>
          <Button variant="primary" loading={task.running} disabled={!queue.items.length} onClick={run}>
            Resize {queue.items.length || ''}
          </Button>
          <Button variant="success" icon={<Download />} disabled={!task.result} onClick={downloadAll}>
            Download
          </Button>
        </>
      }
      info={task.result ? `${formatNumber(task.result.files.length)} texture(s) ready` : undefined}
    >
      {queue.items.length === 0 ? (
        <DropZone
          onFiles={(files) => queue.add(files)}
          accept="image/*"
          formats={['PNG', 'JPG', 'WebP', 'BMP']}
          size="lg"
          title="Drop textures to resize"
        />
      ) : (
        <Panel title="Textures" actions={<QueueHeader count={queue.items.length} onClear={queue.clear} />}>
          <FileGrid items={queue.items} onRemove={queue.remove} />
        </Panel>
      )}

      {task.running && (
        <Panel title="Progress">
          <ProgressBar value={task.progress} label={task.message} />
        </Panel>
      )}
      {task.error && (
        <Notice tone="error" title="Could not finish">
          {task.error}
        </Notice>
      )}

      {task.result && (
        <>
          <div className="grid-3">
            <Stat label="Textures" value={formatNumber(task.result.files.length)} />
            <Stat label="Original" value={formatBytes(task.result.before)} />
            <Stat
              label="Resized"
              value={formatBytes(task.result.after)}
              tone={saved > 0 ? 'ok' : 'neutral'}
              sub={`${Math.abs(saved).toFixed(1)}% ${saved >= 0 ? 'smaller' : 'larger'}`}
            />
          </div>
          <Panel title="Output dimensions">
            <div className="stack-sm">
              {task.result.files.map((f) => (
                <div key={f.name} className="row spread tiny">
                  <span className="truncate" style={{ maxWidth: 280 }}>{f.name}</span>
                  <span className="mono dim">
                    {f.width} × {f.height}
                  </span>
                  <span className="mono dim">{formatBytes(f.blob.size)}</span>
                </div>
              ))}
            </div>
          </Panel>
        </>
      )}
    </ToolShell>
  );
}

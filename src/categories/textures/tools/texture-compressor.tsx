import { useMemo, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { ToolShell } from '../../../components/ToolShell';
import {
  Button,
  Field,
  Notice,
  Panel,
  ProgressBar,
  Select,
  SliderField,
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
  before: number;
}

export default function TextureCompressor() {
  const toast = useToast();
  const queue = useFileQueue({ accept: 'image/*' });
  const [format, setFormat] = useState('image/webp');
  const [quality, setQuality] = useState(82);
  const task = useTask<{ files: ResultFile[]; before: number; after: number }>();

  const encoders = useMemo(() => {
    const map = supportedEncodeTypes();
    return new Set(Object.entries(map).filter(([, ok]) => ok).map(([type]) => type));
  }, []);
  const lossless = format === 'image/png';

  const run = () =>
    task.run(async (report) => {
      if (!queue.items.length) throw new UserError('Add at least one texture first.');
      const files: ResultFile[] = [];
      let before = 0;
      let after = 0;

      for (let i = 0; i < queue.items.length; i += 1) {
        const item = queue.items[i];
        report(i / queue.items.length, `Compressing ${item.file.name}`);
        const image = await loadImage(item.file);
        try {
          const canvas = resizeToCanvas(image, image.width, image.height, { smoothing: true });
          const ext = format === 'image/webp' ? 'webp' : 'png';
          const blob = await canvasToBlob(canvas, format, lossless ? undefined : quality / 100);
          files.push({ name: replaceExt(item.file.name, ext), blob, before: item.file.size });
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
    else downloadBlob(await zipFiles(files.map((f) => ({ name: f.name, data: f.blob }))), 'compressed-textures.zip');
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
          <Field label="Output format">
            <Select
              options={[
                { value: 'image/webp', label: 'WebP (quality-controlled)' },
                { value: 'image/png', label: 'PNG (lossless)' },
              ].filter((o) => encoders.has(o.value))}
              value={format}
              onChange={(event) => {
                setFormat(event.target.value);
                task.reset();
              }}
            />
          </Field>
          {!lossless && (
            <SliderField
              label="Quality"
              value={quality}
              min={1}
              max={100}
              onChange={setQuality}
              format={(v) => `${v}%`}
              hint="Lower values shrink the file and can introduce visible blocking on gradients."
            />
          )}
          <Notice tone="warning" title="File size, not VRAM">
            This reduces download and disk size. It does not produce GPU-compressed formats
            (BC7, ASTC, ETC2) — those need an engine-side importer, because browsers cannot encode
            them. A 2048² RGBA texture still costs the same VRAM after this pass.
          </Notice>
        </>
      }
      actions={
        <>
          <Button variant="ghost" icon={<RefreshCw />} onClick={reset}>
            Reset
          </Button>
          <Button variant="primary" loading={task.running} disabled={!queue.items.length} onClick={run}>
            Compress {queue.items.length || ''}
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
          formats={['PNG', 'JPG', 'WebP']}
          size="lg"
          title="Drop textures to compress"
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
            <Stat label="Original" value={formatBytes(task.result.before)} />
            <Stat label="Compressed" value={formatBytes(task.result.after)} />
            <Stat label="Reduction" value={`${saved.toFixed(1)}%`} tone={saved > 0 ? 'ok' : 'warn'} />
          </div>
          <Panel title="Per texture">
            <div className="stack-sm">
              {task.result.files.map((f) => {
                const pct = f.before > 0 ? ((f.before - f.blob.size) / f.before) * 100 : 0;
                return (
                  <div key={f.name} className="row spread tiny">
                    <span className="truncate" style={{ maxWidth: 280 }}>{f.name}</span>
                    <span className="mono dim">
                      {formatBytes(f.before)} → {formatBytes(f.blob.size)}
                    </span>
                    <span style={{ color: pct >= 0 ? 'var(--emerald)' : 'var(--rose)' }}>
                      {Math.abs(pct).toFixed(1)}%
                    </span>
                  </div>
                );
              })}
            </div>
          </Panel>
        </>
      )}
    </ToolShell>
  );
}

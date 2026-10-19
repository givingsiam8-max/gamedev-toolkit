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
  Segmented,
  Select,
  Stat,
  useToast,
} from '../../../components/ui';
import { DropZone, FileGrid, QueueHeader, useFileQueue } from '../../../components/files';
import { useTask } from '../../../core/hooks';
import { canvasToBlob, loadImage, resizeToCanvas } from '../../../core/image';
import { downloadBlob, zipFiles } from '../../../core/files';
import { formatBytes, formatNumber, replaceExt } from '../../../core/format';
import { UserError } from '../../../core/errors';

type Mode = 'lossless' | 'quality';
type Target = 'image/png' | 'image/webp' | 'image/jpeg';

interface ResultFile {
  name: string;
  blob: Blob;
  originalSize: number;
}

export default function ImageCompressor() {
  const toast = useToast();
  const queue = useFileQueue({ accept: 'image/*' });
  const [mode, setMode] = useState<Mode>('quality');
  const [target, setTarget] = useState<Target>('image/webp');
  const [quality, setQuality] = useState(80);
  const [maxWidth, setMaxWidth] = useState(0);
  const task = useTask<{ files: ResultFile[]; before: number; after: number }>();

  const run = () =>
    task.run(async (report) => {
      if (!queue.items.length) throw new UserError('Add at least one image first.');
      const files: ResultFile[] = [];
      let before = 0;
      let after = 0;

      for (let i = 0; i < queue.items.length; i += 1) {
        const item = queue.items[i];
        report(i / queue.items.length, `Compressing ${item.file.name}`);
        const image = await loadImage(item.file);
        try {
          let outW = image.width;
          let outH = image.height;
          if (maxWidth > 0 && image.width > maxWidth) {
            outW = maxWidth;
            outH = Math.max(1, Math.round((maxWidth / image.width) * image.height));
          }
          const canvas = resizeToCanvas(image, outW, outH, { smoothing: true });
          const blob = await canvasToBlob(
            canvas,
            target,
            mode === 'lossless' && target === 'image/png' ? undefined : quality / 100,
          );
          const ext = target === 'image/png' ? 'png' : target === 'image/webp' ? 'webp' : 'jpg';
          files.push({ name: replaceExt(item.file.name, ext), blob, originalSize: item.file.size });
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
    if (files.length === 1) {
      downloadBlob(files[0].blob, files[0].name);
    } else {
      const zip = await zipFiles(files.map((f) => ({ name: f.name, data: f.blob })));
      downloadBlob(zip, 'compressed.zip');
    }
    toast.success(`Exported ${formatNumber(files.length)} file(s).`);
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
          <Field label="Mode">
            <Segmented
              options={[
                { value: 'quality', label: 'Quality-controlled' },
                { value: 'lossless', label: 'Lossless' },
              ]}
              value={mode}
              onChange={(v) => {
                setMode(v);
                task.reset();
              }}
            />
          </Field>

          <Field label="Output format">
            <Select
              options={[
                { value: 'image/webp', label: 'WebP' },
                { value: 'image/png', label: 'PNG (lossless only)' },
                { value: 'image/jpeg', label: 'JPG' },
              ]}
              value={target}
              onChange={(e) => setTarget(e.target.value as Target)}
            />
          </Field>

          {mode === 'quality' && (
            <Field label="Quality">
              <NumberInput value={quality} min={1} max={100} onChange={setQuality} suffix="%" />
            </Field>
          )}

          <Field label="Max width (px)" hint="0 = keep original width.">
            <NumberInput value={maxWidth} min={0} max={16384} onChange={setMaxWidth} />
          </Field>

          {mode === 'lossless' && target !== 'image/png' && (
            <Notice tone="warning" title="Lossless PNG only">
              Lossless compression is only available for PNG output. WebP and JPG are always lossy.
            </Notice>
          )}
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
      info={task.result ? `${formatNumber(task.result.files.length)} file(s) ready` : undefined}
    >
      {queue.items.length === 0 ? (
        <DropZone
          onFiles={(files) => queue.add(files)}
          accept="image/*"
          formats={['PNG', 'JPG', 'WebP']}
          size="lg"
        />
      ) : (
        <Panel title="Images" actions={<QueueHeader count={queue.items.length} onClear={queue.clear} />}>
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
            <Stat label="Files" value={formatNumber(task.result.files.length)} />
            <Stat label="Original" value={formatBytes(task.result.before)} />
            <Stat
              label="Compressed"
              value={formatBytes(task.result.after)}
              tone={saved > 0 ? 'ok' : 'neutral'}
              sub={`${Math.abs(saved).toFixed(1)}% ${saved >= 0 ? 'smaller' : 'larger'}`}
            />
          </div>
          <Panel title="Per-file results">
            <div className="stack-sm">
              {task.result.files.map((f) => {
                const pct = f.originalSize > 0 ? ((f.originalSize - f.blob.size) / f.originalSize) * 100 : 0;
                return (
                  <div key={f.name} className="row spread tiny">
                    <span className="truncate" style={{ maxWidth: 260 }}>{f.name}</span>
                    <span className="dim mono">
                      {formatBytes(f.originalSize)} → {formatBytes(f.blob.size)}
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

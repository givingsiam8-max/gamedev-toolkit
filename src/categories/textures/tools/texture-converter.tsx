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
}

export default function TextureConverter() {
  const toast = useToast();
  const queue = useFileQueue({ accept: 'image/*' });
  const [format, setFormat] = useState('image/png');
  const [background, setBackground] = useState('#000000');
  const task = useTask<{ files: ResultFile[]; before: number; after: number }>();

  const encoders = useMemo(() => {
    const map = supportedEncodeTypes();
    return new Set(Object.entries(map).filter(([, ok]) => ok).map(([type]) => type));
  }, []);
  const isJpeg = format === 'image/jpeg';

  const run = () =>
    task.run(async (report) => {
      if (!queue.items.length) throw new UserError('Add at least one texture first.');
      const files: ResultFile[] = [];
      let before = 0;
      let after = 0;

      for (let i = 0; i < queue.items.length; i += 1) {
        const item = queue.items[i];
        report(i / queue.items.length, `Converting ${item.file.name}`);
        const image = await loadImage(item.file);
        try {
          const canvas = resizeToCanvas(image, image.width, image.height, {
            smoothing: true,
            background: isJpeg ? background : undefined,
          });
          const ext = format === 'image/webp' ? 'webp' : isJpeg ? 'jpg' : 'png';
          const blob = await canvasToBlob(canvas, format, isJpeg ? 0.92 : undefined);
          files.push({ name: replaceExt(item.file.name, ext), blob });
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
    else downloadBlob(await zipFiles(files.map((f) => ({ name: f.name, data: f.blob }))), 'converted-textures.zip');
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
                { value: 'image/png', label: 'PNG — lossless, alpha' },
                { value: 'image/webp', label: 'WebP — smaller, alpha' },
                { value: 'image/jpeg', label: 'JPG — no alpha' },
              ].filter((o) => encoders.has(o.value))}
              value={format}
              onChange={(event) => setFormat(event.target.value)}
            />
          </Field>
          {isJpeg && (
            <Field label="Background" hint="Transparent pixels are flattened onto this colour.">
              <input
                type="color"
                className="input"
                value={background}
                onChange={(event) => setBackground(event.target.value)}
              />
            </Field>
          )}
          <Notice tone="info" title="Colour space">
            These exports keep pixel values unchanged. If the source is a normal map or a mask
            (linear data), do not let the engine import it as sRGB — set that in your importer, not
            here.
          </Notice>
        </>
      }
      actions={
        <>
          <Button variant="ghost" icon={<RefreshCw />} onClick={reset}>
            Reset
          </Button>
          <Button variant="primary" loading={task.running} disabled={!queue.items.length} onClick={run}>
            Convert {queue.items.length || ''}
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
          title="Drop textures to convert"
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
        <div className="grid-3">
          <Stat label="Textures" value={formatNumber(task.result.files.length)} />
          <Stat label="Original" value={formatBytes(task.result.before)} />
          <Stat
            label="Converted"
            value={formatBytes(task.result.after)}
            tone={saved > 0 ? 'ok' : 'neutral'}
            sub={`${Math.abs(saved).toFixed(1)}% ${saved >= 0 ? 'smaller' : 'larger'}`}
          />
        </div>
      )}
    </ToolShell>
  );
}

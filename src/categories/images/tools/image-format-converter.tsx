import { useMemo, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { ToolShell } from '../../../components/ToolShell';
import {
  Button,
  Field,
  Notice,
  Panel,
  ProgressBar,
  Segmented,
  SliderField,
  Stat,
  useToast,
} from '../../../components/ui';
import { DropZone, FileGrid, QueueHeader, useFileQueue } from '../../../components/files';
import { useTask } from '../../../core/hooks';
import { canvasToBlob, loadImage, supportedEncodeTypes } from '../../../core/image';
import { downloadBlob, zipFiles } from '../../../core/files';
import { formatBytes, formatNumber, replaceExt } from '../../../core/format';
import { UserError } from '../../../core/errors';

type Mode =
  | 'png-to-jpg'
  | 'jpg-to-png'
  | 'png-to-webp'
  | 'webp-to-png'
  | 'jpg-to-webp'
  | 'webp-to-jpg';

interface ModeSpec {
  label: string;
  target: string;
  ext: string;
  lossy: boolean;
}

const MODES: Record<Mode, ModeSpec> = {
  'png-to-jpg': { label: 'PNG → JPG', target: 'image/jpeg', ext: 'jpg', lossy: true },
  'jpg-to-png': { label: 'JPG → PNG', target: 'image/png', ext: 'png', lossy: false },
  'png-to-webp': { label: 'PNG → WebP', target: 'image/webp', ext: 'webp', lossy: true },
  'webp-to-png': { label: 'WebP → PNG', target: 'image/png', ext: 'png', lossy: false },
  'jpg-to-webp': { label: 'JPG → WebP', target: 'image/webp', ext: 'webp', lossy: true },
  'webp-to-jpg': { label: 'WebP → JPG', target: 'image/jpeg', ext: 'jpg', lossy: true },
};

interface ResultFile {
  name: string;
  blob: Blob;
}

export default function ImageFormatConverter() {
  const toast = useToast();
  const queue = useFileQueue({ accept: 'image/*' });
  const [mode, setMode] = useState<Mode>('png-to-jpg');
  const [quality, setQuality] = useState(90);
  const [background, setBackground] = useState('#ffffff');
  const task = useTask<{ files: ResultFile[]; before: number; after: number }>();

  const encoders = useMemo(() => {
    const map = supportedEncodeTypes();
    return new Set(Object.entries(map).filter(([, ok]) => ok).map(([type]) => type));
  }, []);
  const spec = MODES[mode];
  const targetSupported = encoders.has(spec.target);
  const isJpgTarget = spec.target === 'image/jpeg';

  const run = () =>
    task.run(async (report) => {
      if (!queue.items.length) throw new UserError('Add at least one image first.');
      if (!targetSupported) {
        throw new UserError(`This browser cannot encode ${spec.ext.toUpperCase()} files.`);
      }
      const files: ResultFile[] = [];
      let before = 0;
      let after = 0;

      for (let i = 0; i < queue.items.length; i += 1) {
        const item = queue.items[i];
        report(i / queue.items.length, `Converting ${item.file.name}`);
        const image = await loadImage(item.file);
        try {
          const canvas = document.createElement('canvas');
          canvas.width = image.width;
          canvas.height = image.height;
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new UserError('Could not get a 2D drawing context.');
          if (isJpgTarget) {
            ctx.fillStyle = background;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
          }
          ctx.drawImage(image.source, 0, 0);
          const blob = await canvasToBlob(
            canvas,
            spec.target,
            spec.lossy ? quality / 100 : undefined,
          );
          files.push({ name: replaceExt(item.file.name, spec.ext), blob });
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
      downloadBlob(zip, 'converted.zip');
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
          <Field label="Conversion">
            <Segmented
              options={(Object.keys(MODES) as Mode[]).map((m) => ({
                value: m,
                label: MODES[m].label,
                disabled: !encoders.has(MODES[m].target),
              }))}
              value={mode}
              onChange={(next) => {
                setMode(next);
                task.reset();
              }}
            />
          </Field>

          {spec.lossy && (
            <SliderField
              label="Quality"
              value={quality}
              min={1}
              max={100}
              onChange={setQuality}
              format={(v) => `${v}%`}
              hint="Higher quality means a larger file. This is lossy compression."
            />
          )}

          {isJpgTarget && (
            <Field
              label="Background for transparency"
              hint="JPG has no alpha channel — transparent pixels are filled with this colour."
            >
              <input
                type="color"
                className="input"
                value={background}
                onChange={(event) => setBackground(event.target.value)}
              />
            </Field>
          )}

          {!targetSupported && (
            <Notice tone="warning" title="Target not supported">
              This browser cannot encode {spec.ext.toUpperCase()}. Pick another conversion.
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
            icon={<Download />}
            loading={task.running}
            disabled={!queue.items.length || !targetSupported}
            onClick={run}
          >
            Convert {queue.items.length || ''}
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
        <div className="grid-3">
          <Stat label="Files" value={formatNumber(task.result.files.length)} />
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

import { useMemo, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { ToolShell } from '../../../components/ToolShell';
import {
  Button,
  CheckBox,
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

type Sizing = 'exact' | 'percent' | 'preset';
type Fit = 'fit' | 'fill' | 'stretch';

const PRESETS = [
  { value: '128', label: '128 × 128' },
  { value: '256', label: '256 × 256' },
  { value: '512', label: '512 × 512' },
  { value: '1024', label: '1024 × 1024' },
  { value: '2048', label: '2048 × 2048' },
  { value: '4096', label: '4096 × 4096' },
  { value: '1920x1080', label: '1920 × 1080' },
];

const FORMATS = [
  { value: 'image/png', label: 'PNG' },
  { value: 'image/jpeg', label: 'JPG' },
  { value: 'image/webp', label: 'WebP' },
];

interface ResultFile {
  name: string;
  blob: Blob;
}

export default function ImageResizer() {
  const toast = useToast();
  const queue = useFileQueue({ accept: 'image/*' });
  const [sizing, setSizing] = useState<Sizing>('exact');
  const [width, setWidth] = useState(1024);
  const [height, setHeight] = useState(1024);
  const [lockAspect, setLockAspect] = useState(true);
  const [percent, setPercent] = useState(50);
  const [preset, setPreset] = useState('1024');
  const [fit, setFit] = useState<Fit>('fit');
  const [format, setFormat] = useState('image/png');
  const [quality, setQuality] = useState(90);
  const [nearest, setNearest] = useState(false);
  const task = useTask<{ files: ResultFile[]; before: number; after: number }>();

  const target = useMemo(() => {
    if (sizing === 'percent') return null;
    if (sizing === 'preset') {
      if (preset === '1920x1080') return { width: 1920, height: 1080 };
      const square = Number(preset);
      return { width: square, height: square };
    }
    return { width, height };
  }, [sizing, preset, width, height]);

  const onWidthChange = (value: number) => {
    setWidth(value);
    if (lockAspect && height > 0 && width > 0) {
      setHeight(Math.max(1, Math.round((value / width) * height)));
    }
  };

  const run = () =>
    task.run(async (report) => {
      if (!queue.items.length) throw new UserError('Add at least one image first.');
      const files: ResultFile[] = [];
      let before = 0;
      let after = 0;

      for (let i = 0; i < queue.items.length; i += 1) {
        const item = queue.items[i];
        report(i / queue.items.length, `Resizing ${item.file.name}`);
        const image = await loadImage(item.file);
        try {
          let outW: number;
          let outH: number;
          if (sizing === 'percent') {
            outW = Math.max(1, Math.round((image.width * percent) / 100));
            outH = Math.max(1, Math.round((image.height * percent) / 100));
          } else if (target) {
            if (fit === 'stretch') {
              outW = target.width;
              outH = target.height;
            } else if (fit === 'fill') {
              const scale = Math.max(target.width / image.width, target.height / image.height);
              outW = Math.round(image.width * scale);
              outH = Math.round(image.height * scale);
            } else {
              const scale = Math.min(target.width / image.width, target.height / image.height);
              outW = Math.max(1, Math.round(image.width * scale));
              outH = Math.max(1, Math.round(image.height * scale));
            }
          } else {
            throw new UserError('No target size set.');
          }

          const ext = format === 'image/png' ? 'png' : format === 'image/webp' ? 'webp' : 'jpg';
          const canvas = resizeToCanvas(image, outW, outH, {
            smoothing: !nearest,
            cover: fit === 'fill',
          });
          const blob = await canvasToBlob(
            canvas,
            format,
            format === 'image/png' ? undefined : quality / 100,
          );
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
    if (files.length === 1) {
      downloadBlob(files[0].blob, files[0].name);
    } else {
      const zip = await zipFiles(files.map((f) => ({ name: f.name, data: f.blob })));
      downloadBlob(zip, 'resized.zip');
    }
    toast.success(`Exported ${formatNumber(files.length)} file(s).`);
  };

  const reset = () => {
    task.reset();
    queue.clear();
    setSizing('exact');
    setWidth(1024);
    setHeight(1024);
    setPercent(50);
    setNearest(false);
  };

  const lossy = format !== 'image/png';
  const saved =
    task.result && task.result.before > 0
      ? ((task.result.before - task.result.after) / task.result.before) * 100
      : 0;

  return (
    <ToolShell
      sidebar={
        <>
          <Field label="Sizing mode">
            <Segmented
              options={[
                { value: 'exact', label: 'Exact px' },
                { value: 'percent', label: 'Percent' },
                { value: 'preset', label: 'Presets' },
              ]}
              value={sizing}
              onChange={(v) => {
                setSizing(v);
                task.reset();
              }}
            />
          </Field>

          {sizing === 'exact' && (
            <>
              <Field label="Width (px)">
                <NumberInput value={width} min={1} max={16384} onChange={onWidthChange} />
              </Field>
              <Field label="Height (px)">
                <NumberInput value={height} min={1} max={16384} onChange={setHeight} />
              </Field>
              <CheckBox
                checked={lockAspect}
                onChange={setLockAspect}
                label="Lock aspect ratio"
                hint="Changing width adjusts height proportionally."
              />
              <Field label="Fit mode" hint="How the target box relates to the source.">
                <Segmented
                  options={[
                    { value: 'fit', label: 'Fit' },
                    { value: 'fill', label: 'Fill' },
                    { value: 'stretch', label: 'Stretch' },
                  ]}
                  value={fit}
                  onChange={setFit}
                />
              </Field>
            </>
          )}

          {sizing === 'percent' && (
            <Field label="Scale (%)">
              <NumberInput value={percent} min={1} max={1000} onChange={setPercent} suffix="%" />
            </Field>
          )}

          {sizing === 'preset' && (
            <>
              <Field label="Preset">
                <Select options={PRESETS} value={preset} onChange={(e) => setPreset(e.target.value)} />
              </Field>
              <Field label="Fit mode">
                <Segmented
                  options={[
                    { value: 'fit', label: 'Fit' },
                    { value: 'fill', label: 'Fill' },
                    { value: 'stretch', label: 'Stretch' },
                  ]}
                  value={fit}
                  onChange={setFit}
                />
              </Field>
            </>
          )}

          <Field label="Output format">
            <Select options={FORMATS} value={format} onChange={(e) => setFormat(e.target.value)} />
          </Field>
          {lossy && (
            <Field label="Quality">
              <NumberInput value={quality} min={1} max={100} onChange={setQuality} suffix="%" />
            </Field>
          )}
          <CheckBox
            checked={nearest}
            onChange={setNearest}
            label="Nearest neighbour"
            hint="Sharp pixels for pixel art; disables smoothing."
          />
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
            disabled={!queue.items.length}
            onClick={run}
          >
            Resize {queue.items.length || ''}
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
          formats={['PNG', 'JPG', 'WebP', 'BMP']}
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
            label="Resized"
            value={formatBytes(task.result.after)}
            tone={saved > 0 ? 'ok' : 'neutral'}
            sub={`${Math.abs(saved).toFixed(1)}% ${saved >= 0 ? 'smaller' : 'larger'}`}
          />
        </div>
      )}
    </ToolShell>
  );
}

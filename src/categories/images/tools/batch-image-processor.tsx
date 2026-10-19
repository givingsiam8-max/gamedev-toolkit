import { useState } from 'react';
import { Download, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { ToolShell } from '../../../components/ToolShell';
import {
  Button,
  Field,
  IconButton,
  Notice,
  NumberInput,
  Panel,
  ProgressBar,
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

interface Step {
  id: string;
  kind: 'resize' | 'format' | 'quality';
  width: number;
  height: number;
  format: string;
  quality: number;
}

let stepCounter = 0;
const nextStepId = () => `step_${(stepCounter += 1)}`;

const FORMATS = [
  { value: 'image/png', label: 'PNG' },
  { value: 'image/jpeg', label: 'JPG' },
  { value: 'image/webp', label: 'WebP' },
];

interface ResultFile {
  name: string;
  blob: Blob;
}

export default function BatchImageProcessor() {
  const toast = useToast();
  const queue = useFileQueue({ accept: 'image/*', maxFiles: 300 });
  const [steps, setSteps] = useState<Step[]>([]);
  const task = useTask<{ files: ResultFile[]; before: number; after: number }>();

  const addStep = (kind: Step['kind']) => {
    const base: Step = {
      id: nextStepId(),
      kind,
      width: 1024,
      height: 1024,
      format: 'image/png',
      quality: 85,
    };
    setSteps((prev) => [...prev, base]);
  };

  const removeStep = (id: string) => setSteps((prev) => prev.filter((s) => s.id !== id));

  const updateStep = (id: string, patch: Partial<Step>) =>
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  const run = () =>
    task.run(async (report) => {
      if (!queue.items.length) throw new UserError('Add at least one image first.');
      if (!steps.length) throw new UserError('Add at least one processing step.');
      const files: ResultFile[] = [];
      let before = 0;
      let after = 0;

      for (let i = 0; i < queue.items.length; i += 1) {
        const item = queue.items[i];
        report(i / queue.items.length, `Processing ${item.file.name}`);
        let image = await loadImage(item.file);
        let currentFormat = 'image/png';
        let currentQuality: number | undefined;

        try {
          for (const step of steps) {
            if (step.kind === 'resize') {
              const canvas = resizeToCanvas(image, step.width, step.height, { smoothing: true });
              const blob = await canvasToBlob(canvas, currentFormat, currentQuality);
              image.dispose();
              image = await loadImage(blob);
            } else if (step.kind === 'format') {
              currentFormat = step.format;
              const canvas = resizeToCanvas(image, image.width, image.height, { smoothing: true });
              const blob = await canvasToBlob(canvas, currentFormat, currentQuality);
              image.dispose();
              image = await loadImage(blob);
            } else {
              currentQuality = step.quality / 100;
              const canvas = resizeToCanvas(image, image.width, image.height, { smoothing: true });
              const blob = await canvasToBlob(canvas, currentFormat, currentQuality);
              image.dispose();
              image = await loadImage(blob);
            }
          }

          const ext = currentFormat === 'image/png' ? 'png' : currentFormat === 'image/webp' ? 'webp' : 'jpg';
          const canvas = resizeToCanvas(image, image.width, image.height, { smoothing: true });
          const blob = await canvasToBlob(canvas, currentFormat, currentQuality);
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
      downloadBlob(zip, 'batch-processed.zip');
    }
    toast.success(`Exported ${formatNumber(files.length)} file(s).`);
  };

  const reset = () => {
    task.reset();
    queue.clear();
    setSteps([]);
  };

  const saved =
    task.result && task.result.before > 0
      ? ((task.result.before - task.result.after) / task.result.before) * 100
      : 0;

  return (
    <ToolShell
      sidebar={
        <>
          <Field label="Pipeline steps" hint="Applied in order to every file.">
            <div className="stack-sm">
              {steps.length === 0 && <div className="dim tiny">No steps yet.</div>}
              {steps.map((step, index) => (
                <div key={step.id} className="card" style={{ padding: 10 }}>
                  <div className="row spread" style={{ marginBottom: 6 }}>
                    <span className="strong tiny">
                      {index + 1}. {step.kind === 'resize' ? 'Resize' : step.kind === 'format' ? 'Convert' : 'Quality'}
                    </span>
                    <IconButton label="Remove step" icon={<Trash2 />} size="sm" onClick={() => removeStep(step.id)} />
                  </div>
                  {step.kind === 'resize' && (
                    <div className="row">
                      <NumberInput value={step.width} min={1} max={16384} onChange={(v) => updateStep(step.id, { width: v })} />
                      <NumberInput value={step.height} min={1} max={16384} onChange={(v) => updateStep(step.id, { height: v })} />
                    </div>
                  )}
                  {step.kind === 'format' && (
                    <Select
                      options={FORMATS}
                      value={step.format}
                      onChange={(e) => updateStep(step.id, { format: e.target.value })}
                    />
                  )}
                  {step.kind === 'quality' && (
                    <NumberInput value={step.quality} min={1} max={100} onChange={(v) => updateStep(step.id, { quality: v })} suffix="%" />
                  )}
                </div>
              ))}
            </div>
          </Field>
          <div className="row-wrap">
            <Button size="sm" icon={<Plus />} onClick={() => addStep('resize')}>
              Resize
            </Button>
            <Button size="sm" icon={<Plus />} onClick={() => addStep('format')}>
              Convert
            </Button>
            <Button size="sm" icon={<Plus />} onClick={() => addStep('quality')}>
              Quality
            </Button>
          </div>
        </>
      }
      actions={
        <>
          <Button variant="ghost" icon={<RefreshCw />} onClick={reset}>
            Reset
          </Button>
          <Button variant="primary" loading={task.running} disabled={!queue.items.length || !steps.length} onClick={run}>
            Process {queue.items.length || ''}
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
            label="Output"
            value={formatBytes(task.result.after)}
            tone={saved > 0 ? 'ok' : 'neutral'}
            sub={`${Math.abs(saved).toFixed(1)}% ${saved >= 0 ? 'smaller' : 'larger'}`}
          />
        </div>
      )}
    </ToolShell>
  );
}

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
  Select,
  Stat,
  useToast,
} from '../../../components/ui';
import { DropZone, FileGrid, QueueHeader, useFileQueue } from '../../../components/files';
import { useObjectUrl, useTask } from '../../../core/hooks';
import { context2d, createCanvas, loadImage } from '../../../core/image';
import { downloadBlob } from '../../../core/files';
import { formatBytes, formatNumber } from '../../../core/format';
import { UserError } from '../../../core/errors';

interface Result {
  blob: Blob;
  width: number;
  height: number;
  frames: number;
}

export default function FramesToGif() {
  const toast = useToast();
  const queue = useFileQueue({ accept: 'image/*', maxFiles: 300 });
  const [delay, setDelay] = useState(100);
  const [colours, setColours] = useState(256);
  const [loop, setLoop] = useState('infinite');
  const task = useTask<Result>();
  const previewUrl = useObjectUrl(task.result?.blob ?? null);

  const run = () =>
    task.run(async (report) => {
      if (!queue.items.length) throw new UserError('Add at least two frames first.');
      const { GIFEncoder, quantize, applyPalette } = await import('gifenc');

      const loaded: Array<Awaited<ReturnType<typeof loadImage>>> = [];
      try {
        for (let i = 0; i < queue.items.length; i += 1) {
          const item = queue.items[i];
          report((i / queue.items.length) * 0.3, `Loading ${item.file.name}`);
          loaded.push(await loadImage(item.file));
        }
        const width = Math.max(...loaded.map((image) => image.width));
        const height = Math.max(...loaded.map((image) => image.height));
        const canvas = createCanvas(width, height);
        const ctx = context2d(canvas);
        const encoder = GIFEncoder();

        for (let i = 0; i < loaded.length; i += 1) {
          report(0.3 + (i / loaded.length) * 0.6, `Encoding frame ${i + 1}/${loaded.length}`);
          ctx.clearRect(0, 0, width, height);
          const image = loaded[i];
          const scale = Math.min(width / image.width, height / image.height, 1);
          const drawW = Math.round(image.width * scale);
          const drawH = Math.round(image.height * scale);
          ctx.drawImage(image.source, Math.round((width - drawW) / 2), Math.round((height - drawH) / 2), drawW, drawH);
          const data = ctx.getImageData(0, 0, width, height).data;
          const palette = quantize(data, colours, { format: 'rgba4444' });
          const index = applyPalette(data, palette, 'rgba4444');
          encoder.writeFrame(index, width, height, {
            palette,
            delay: Math.max(20, delay),
            first: i === 0,
            repeat: loop === 'infinite' ? 0 : -1,
          });
        }

        encoder.finish();
        report(0.97, 'Finishing GIF');
        const bytes = encoder.bytesView();
        return {
          blob: new Blob([bytes as BlobPart], { type: 'image/gif' }),
          width,
          height,
          frames: loaded.length,
        };
      } finally {
        for (const image of loaded) image.dispose();
      }
    });

  const reset = () => {
    task.reset();
    queue.clear();
  };

  return (
    <ToolShell
      sidebar={
        <>
          <Field label="Frame delay (ms)" hint="Per frame. 100 ms ≈ 10 fps.">
            <NumberInput value={delay} min={20} max={5000} step={10} onChange={setDelay} />
          </Field>
          <Field label="Colours" hint="Fewer colours shrink the GIF but band gradients.">
            <Select
              value={String(colours)}
              onChange={(e) => setColours(Number(e.target.value))}
              options={[2, 16, 32, 64, 128, 256].map((n) => ({ value: String(n), label: String(n) }))}
            />
          </Field>
          <Field label="Loop">
            <Select
              value={loop}
              onChange={(e) => setLoop(e.target.value)}
              options={[
                { value: 'infinite', label: 'Loop forever' },
                { value: 'once', label: 'Play once' },
              ]}
            />
          </Field>
          <Notice tone="info">
            Frames keep their transparency through a one-bit alpha palette. Frames are contain-fitted
            to the largest frame’s size and centred.
          </Notice>
        </>
      }
      actions={
        <>
          <Button variant="ghost" icon={<RefreshCw />} onClick={reset}>
            Reset
          </Button>
          <Button variant="primary" loading={task.running} disabled={queue.items.length < 2} onClick={run}>
            Build GIF
          </Button>
          <Button
            variant="success"
            icon={<Download />}
            disabled={!task.result}
            onClick={() => {
              if (!task.result) return;
              downloadBlob(task.result.blob, 'animation.gif');
              toast.success('Downloaded animation.gif');
            }}
          >
            Download
          </Button>
        </>
      }
      info={task.result ? `${task.result.frames} frames` : undefined}
    >
      {queue.items.length === 0 ? (
        <DropZone
          onFiles={(files) => queue.add(files)}
          accept="image/*"
          formats={['PNG', 'JPG', 'WebP']}
          size="lg"
          title="Drop frames in order (2 or more)"
        />
      ) : (
        <Panel title="Frames" actions={<QueueHeader count={queue.items.length} onClear={queue.clear} />}>
          <FileGrid items={queue.items} onRemove={queue.remove} />
        </Panel>
      )}

      {task.running && (
        <Panel title="Progress">
          <ProgressBar value={task.progress} label={task.message} />
        </Panel>
      )}
      {task.error && (
        <Notice tone="error" title="Could not build the GIF">
          {task.error}
        </Notice>
      )}
      {task.result && previewUrl && (
        <>
          <div className="grid-3">
            <Stat label="Dimensions" value={`${formatNumber(task.result.width)} × ${formatNumber(task.result.height)}`} />
            <Stat label="Frames" value={formatNumber(task.result.frames)} />
            <Stat label="GIF size" value={formatBytes(task.result.blob.size)} />
          </div>
          <Panel title="Preview">
            <div className="stage checker">
              <img src={previewUrl} alt="Animated preview" style={{ maxWidth: '100%', maxHeight: 420, display: 'block' }} />
            </div>
          </Panel>
        </>
      )}
    </ToolShell>
  );
}

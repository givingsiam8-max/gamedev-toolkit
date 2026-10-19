import { useEffect, useRef, useState } from 'react';
import { Pause, Play, RefreshCw, SkipForward } from 'lucide-react';
import { ToolShell } from '../../../components/ToolShell';
import {
  Button,
  IconButton,
  Notice,
  Panel,
  SliderField,
  Stat,
} from '../../../components/ui';
import { DropZone, FileGrid, QueueHeader, useFileQueue } from '../../../components/files';
import { useAnimationFrame, useTask } from '../../../core/hooks';
import { context2d, loadImage, type LoadedImage } from '../../../core/image';
import { formatDuration, formatNumber } from '../../../core/format';
import { UserError } from '../../../core/errors';

interface Prepared {
  count: number;
  width: number;
  height: number;
}

export default function SpriteAnimationPreview() {
  const queue = useFileQueue({ accept: 'image/*', maxFiles: 300 });
  const [fps, setFps] = useState(12);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [meta, setMeta] = useState<Prepared | null>(null);
  const framesRef = useRef<LoadedImage[]>([]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const accumulator = useRef(0);
  const task = useTask<Prepared>();

  useEffect(
    () => () => {
      for (const frameImage of framesRef.current) frameImage.dispose();
      framesRef.current = [];
    },
    [],
  );

  useEffect(() => {
    const frames = framesRef.current;
    const canvas = canvasRef.current;
    if (!canvas || !frames.length) return;
    const current = frames[Math.min(frame, frames.length - 1)];
    if (!current) return;
    canvas.width = current.width;
    canvas.height = current.height;
    const ctx = context2d(canvas);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(current.source, 0, 0);
  }, [frame, meta]);

  useAnimationFrame((delta) => {
    const frames = framesRef.current;
    if (!playing || frames.length < 2) return;
    accumulator.current += delta;
    const interval = 1 / Math.max(1, fps);
    if (accumulator.current >= interval) {
      accumulator.current = accumulator.current % interval;
      setFrame((current) => (current + 1) % frames.length);
    }
  }, playing);

  const prepare = () =>
    task.run(async (report) => {
      if (!queue.items.length) throw new UserError('Add at least one frame first.');
      for (const frameImage of framesRef.current) frameImage.dispose();
      framesRef.current = [];
      let width = 0;
      let height = 0;
      for (let i = 0; i < queue.items.length; i += 1) {
        report(i / queue.items.length, `Loading ${queue.items[i].file.name}`);
        const image = await loadImage(queue.items[i].file);
        framesRef.current.push(image);
        width = Math.max(width, image.width);
        height = Math.max(height, image.height);
      }
      setFrame(0);
      accumulator.current = 0;
      const value = { count: framesRef.current.length, width, height };
      setMeta(value);
      return value;
    });

  const reset = () => {
    setPlaying(false);
    for (const frameImage of framesRef.current) frameImage.dispose();
    framesRef.current = [];
    queue.clear();
    setMeta(null);
    setFrame(0);
    setFps(12);
    task.reset();
  };

  return (
    <ToolShell
      sidebar={
        <>
          <SliderField
            label="Frames per second"
            value={fps}
            min={1}
            max={60}
            onChange={setFps}
            format={(v) => `${v} fps`}
          />
          {meta && (
            <>
              <SliderField
                label={`Frame ${frame + 1} / ${meta.count}`}
                value={frame}
                min={0}
                max={Math.max(0, meta.count - 1)}
                onChange={(v) => {
                  setPlaying(false);
                  setFrame(Math.round(v));
                }}
              />
              <div className="row">
                <IconButton
                  label="Previous frame"
                  icon={<SkipForward style={{ transform: 'rotate(180deg)' }} />}
                  onClick={() => {
                    setPlaying(false);
                    setFrame((f) => (f - 1 + meta.count) % meta.count);
                  }}
                />
                <Button variant="primary" icon={playing ? <Pause /> : <Play />} onClick={() => setPlaying((p) => !p)}>
                  {playing ? 'Pause' : 'Play'}
                </Button>
                <IconButton
                  label="Next frame"
                  icon={<SkipForward />}
                  onClick={() => {
                    setPlaying(false);
                    setFrame((f) => (f + 1) % meta.count);
                  }}
                />
              </div>
            </>
          )}
          <Notice tone="info">
            Playback is driven by requestAnimationFrame against wall-clock time, so the preview keeps
            the requested FPS regardless of monitor refresh rate.
          </Notice>
        </>
      }
      actions={
        <>
          <Button variant="ghost" icon={<RefreshCw />} onClick={reset}>
            Reset
          </Button>
          <Button variant="primary" loading={task.running} disabled={!queue.items.length} onClick={prepare}>
            Load frames
          </Button>
        </>
      }
      info={meta ? `${meta.count} frames · ${formatDuration(meta.count / Math.max(1, fps))} loop` : undefined}
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
        <Panel title="Frames" actions={<QueueHeader count={queue.items.length} label="frames" onClear={queue.clear} />}>
          <FileGrid items={queue.items} onRemove={queue.remove} />
        </Panel>
      )}

      {task.error && (
        <Notice tone="error" title="Could not load frames">
          {task.error}
        </Notice>
      )}

      {meta && (
        <>
          <Panel title="Preview">
            <div className="stage checker" style={{ padding: 12, minHeight: 300 }}>
              <canvas ref={canvasRef} style={{ maxWidth: '100%', maxHeight: 440, display: 'block' }} />
            </div>
          </Panel>
          <div className="grid-4">
            <Stat label="Frames" value={formatNumber(meta.count)} />
            <Stat label="FPS" value={String(fps)} />
            <Stat label="Loop duration" value={formatDuration(meta.count / Math.max(1, fps))} />
            <Stat label="Largest frame" value={`${meta.width} × ${meta.height}`} />
          </div>
        </>
      )}
    </ToolShell>
  );
}

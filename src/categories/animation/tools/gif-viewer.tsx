import { useEffect, useRef, useState } from 'react';
import { Pause, Play, RefreshCw, SkipForward } from 'lucide-react';
import { ToolShell } from '../../../components/ToolShell';
import {
  Button,
  Field,
  IconButton,
  Notice,
  Panel,
  SliderField,
  Stat,
} from '../../../components/ui';
import { DropZone } from '../../../components/files';
import { useTask } from '../../../core/hooks';
import { context2d } from '../../../core/image';
import { formatDuration, formatNumber } from '../../../core/format';
import { decodeGif, totalDuration } from '../gif';

interface Meta {
  width: number;
  height: number;
  count: number;
  duration: number;
  delays: number[];
}

export default function GifViewer() {
  const [file, setFile] = useState<File | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const gifRef = useRef<Awaited<ReturnType<typeof decodeGif>> | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const task = useTask<Meta>();

  useEffect(() => {
    const gif = gifRef.current;
    const canvas = canvasRef.current;
    if (!gif || !canvas) return;
    const frame = gif.frames[index];
    if (!frame) return;
    canvas.width = gif.width;
    canvas.height = gif.height;
    context2d(canvas).putImageData(frame.image, 0, 0);
  }, [index]);

  useEffect(() => {
    if (!playing || !meta) return;
    const delay = Math.max(20, (meta.delays[index] ?? 100) / speed);
    const timer = window.setTimeout(() => {
      setIndex((current) => (current + 1) % meta.count);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [playing, index, meta, speed]);

  const onFiles = async (files: File[]) => {
    const f = files[0];
    if (!f) return;
    setFile(f);
    setMeta(null);
    setIndex(0);
    gifRef.current = null;
    await task.run(async () => {
      const gif = await decodeGif(f);
      gifRef.current = gif;
      const value: Meta = {
        width: gif.width,
        height: gif.height,
        count: gif.frames.length,
        duration: totalDuration(gif),
        delays: gif.frames.map((frame) => frame.delay),
      };
      setMeta(value);
      setPlaying(true);
      window.setTimeout(() => {
        const canvas = canvasRef.current;
        if (canvas) {
          canvas.width = gif.width;
          canvas.height = gif.height;
          context2d(canvas).putImageData(gif.frames[0].image, 0, 0);
        }
      }, 0);
      return value;
    });
  };

  const reset = () => {
    gifRef.current = null;
    setFile(null);
    setMeta(null);
    setIndex(0);
    setPlaying(true);
    setSpeed(1);
    task.reset();
  };

  return (
    <ToolShell
      sidebar={
        <>
          <SliderField label="Speed" value={speed} min={0.1} max={4} step={0.1} onChange={setSpeed} format={(v) => `${v.toFixed(1)}×`} />
          {meta && (
            <>
              <Field label="Frame">
                <SliderField
                  label={`${index + 1} / ${meta.count}`}
                  value={index}
                  min={0}
                  max={Math.max(0, meta.count - 1)}
                  onChange={(v) => {
                    setPlaying(false);
                    setIndex(Math.round(v));
                  }}
                />
              </Field>
              <div className="row">
                <IconButton
                  label="Previous frame"
                  icon={<SkipForward style={{ transform: 'rotate(180deg)' }} />}
                  onClick={() => {
                    setPlaying(false);
                    setIndex((i) => (i - 1 + meta.count) % meta.count);
                  }}
                />
                <Button
                  variant="primary"
                  icon={playing ? <Pause /> : <Play />}
                  onClick={() => setPlaying((p) => !p)}
                >
                  {playing ? 'Pause' : 'Play'}
                </Button>
                <IconButton
                  label="Next frame"
                  icon={<SkipForward />}
                  onClick={() => {
                    setPlaying(false);
                    setIndex((i) => (i + 1) % meta.count);
                  }}
                />
              </div>
              <Notice tone="info">
                Delays come from the GIF itself; “speed” scales them. Browsers apply a minimum frame
                delay, so very fast GIFs may play slower here than the stored timing.
              </Notice>
            </>
          )}
        </>
      }
      actions={
        <Button variant="ghost" icon={<RefreshCw />} onClick={reset}>
          Reset
        </Button>
      }
      info={meta ? `${meta.count} frames · ${formatDuration(meta.duration / 1000)}` : undefined}
    >
      {!file ? (
        <DropZone
          onFiles={(files) => void onFiles(files)}
          accept="image/gif,.gif"
          formats={['GIF']}
          size="lg"
          multiple={false}
          title="Drop a GIF to view"
        />
      ) : (
        <Panel title={file.name}>
          {task.running && <div className="dim tiny">Decoding frames…</div>}
          {task.error && (
            <Notice tone="error" title="Could not decode">
              {task.error}
            </Notice>
          )}
          <div className="stage checker" style={{ padding: 12 }}>
            <canvas ref={canvasRef} style={{ maxWidth: '100%', maxHeight: 480, display: 'block' }} />
          </div>
        </Panel>
      )}
      {meta && (
        <div className="grid-4">
          <Stat label="Dimensions" value={`${formatNumber(meta.width)} × ${formatNumber(meta.height)}`} />
          <Stat label="Frames" value={formatNumber(meta.count)} />
          <Stat label="Duration" value={formatDuration(meta.duration / 1000)} />
          <Stat label="Average delay" value={`${Math.round(meta.duration / Math.max(1, meta.count))} ms`} />
        </div>
      )}
    </ToolShell>
  );
}

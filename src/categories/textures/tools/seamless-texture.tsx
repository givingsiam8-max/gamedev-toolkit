import { useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { ToolShell } from '../../../components/ToolShell';
import {
  Button,
  Notice,
  Panel,
  SliderField,
  Stat,
  useToast,
} from '../../../components/ui';
import { DropZone } from '../../../components/files';
import { useObjectUrl, useTask } from '../../../core/hooks';
import { canvasToBlob, context2d, createCanvas, loadImage } from '../../../core/image';
import { downloadBlob } from '../../../core/files';
import { formatBytes, stripExt } from '../../../core/format';
import { UserError } from '../../../core/errors';

const mod = (n: number, m: number) => ((n % m) + m) % m;

export default function SeamlessTexture() {
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [offset, setOffset] = useState(50);
  const [blend, setBlend] = useState(8);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const sourceUrl = useObjectUrl(file);
  const task = useTask<{ blob: Blob; name: string; width: number; height: number }>();

  const run = () =>
    task.run(async () => {
      if (!file) throw new UserError('Add a texture first.');
      const image = await loadImage(file);
      try {
        const W = image.width;
        const H = image.height;
        const ox = Math.round((offset / 100) * W);
        const oy = Math.round((offset / 100) * H);

        const canvas = createCanvas(W, H);
        const ctx = context2d(canvas);
        // Wrap the image so the original edges land in the middle.
        for (let ix = -1; ix <= 1; ix += 1) {
          for (let iy = -1; iy <= 1; iy += 1) {
            ctx.drawImage(image.source, ix * W + ox, iy * H + oy);
          }
        }

        const shifted = ctx.getImageData(0, 0, W, H);
        const out = ctx.createImageData(W, H);
        const src = shifted.data;
        const dst = out.data;
        const bx = Math.max(0, Math.round((blend / 100) * W));
        const by = Math.max(0, Math.round((blend / 100) * H));

        for (let y = 0; y < H; y += 1) {
          for (let x = 0; x < W; x += 1) {
            const i = (y * W + x) * 4;
            let r = src[i];
            let g = src[i + 1];
            let b = src[i + 2];
            let a = src[i + 3];

            if (bx > 0) {
              let dx = x - ox;
              if (dx > W / 2) dx -= W;
              if (dx < -W / 2) dx += W;
              if (Math.abs(dx) < bx) {
                const weight = (1 - Math.abs(dx) / bx) * 0.5;
                const mx = mod(2 * ox - x, W);
                const j = (y * W + mx) * 4;
                r = r * (1 - weight) + src[j] * weight;
                g = g * (1 - weight) + src[j + 1] * weight;
                b = b * (1 - weight) + src[j + 2] * weight;
                a = a * (1 - weight) + src[j + 3] * weight;
              }
            }

            if (by > 0) {
              let dy = y - oy;
              if (dy > H / 2) dy -= H;
              if (dy < -H / 2) dy += H;
              if (Math.abs(dy) < by) {
                const weight = (1 - Math.abs(dy) / by) * 0.5;
                const my = mod(2 * oy - y, H);
                const j = (my * W + x) * 4;
                r = r * (1 - weight) + src[j] * weight;
                g = g * (1 - weight) + src[j + 1] * weight;
                b = b * (1 - weight) + src[j + 2] * weight;
                a = a * (1 - weight) + src[j + 3] * weight;
              }
            }

            dst[i] = r;
            dst[i + 1] = g;
            dst[i + 2] = b;
            dst[i + 3] = a;
          }
        }

        ctx.putImageData(out, 0, 0);
        const blob = await canvasToBlob(canvas, 'image/png');
        setResultBlob(blob);
        setResultUrl(URL.createObjectURL(blob));
        return { blob, name: `${stripExt(file.name)}-seamless.png`, width: W, height: H };
      } finally {
        image.dispose();
      }
    });

  const onFiles = (files: File[]) => {
    const f = files[0];
    if (!f) return;
    setFile(f);
    setResultBlob(null);
    setResultUrl(null);
    task.reset();
  };

  const reset = () => {
    setFile(null);
    setOffset(50);
    setBlend(8);
    setResultBlob(null);
    setResultUrl(null);
    task.reset();
  };

  return (
    <ToolShell
      sidebar={
        <>
          <SliderField
            label="Offset"
            value={offset}
            min={0}
            max={100}
            onChange={(v) => {
              setOffset(v);
              task.reset();
            }}
            format={(v) => `${v}%`}
            hint="Shifts the image so the original seams move into view. 50% puts them in the middle."
          />
          <SliderField
            label="Blend width"
            value={blend}
            min={0}
            max={25}
            onChange={(v) => {
              setBlend(v);
              task.reset();
            }}
            format={(v) => `${v}%`}
            hint="How far the mirrored cross-fade reaches across each seam."
          />
          <Notice tone="warning" title="Mirror blend, not magic">
            This is the offset-and-blend technique: it hides the seam by cross-fading mirrored
            pixels. Strong patterns and directional textures can still show a soft symmetric band —
            inspect the result at 100% before using it.
          </Notice>
        </>
      }
      actions={
        <>
          <Button variant="ghost" icon={<RefreshCw />} onClick={reset}>
            Reset
          </Button>
          <Button variant="primary" loading={task.running} disabled={!file} onClick={run}>
            Make seamless
          </Button>
          <Button
            variant="success"
            icon={<Download />}
            disabled={!resultBlob || !task.result}
            onClick={() => {
              if (!task.result) return;
              downloadBlob(task.result.blob, task.result.name);
              toast.success('Downloaded.');
            }}
          >
            Download PNG
          </Button>
        </>
      }
      info={task.result ? `${task.result.width} × ${task.result.height}` : undefined}
    >
      {!file ? (
        <DropZone
          onFiles={onFiles}
          accept="image/*"
          formats={['PNG', 'JPG', 'WebP']}
          size="lg"
          multiple={false}
          title="Drop a texture to make seamless"
        />
      ) : (
        <div className="grid-2">
          <Panel title="Original">
            {sourceUrl && <img src={sourceUrl} alt="Original" style={{ maxWidth: '100%', maxHeight: 340, display: 'block' }} />}
          </Panel>
          <Panel title="Seamless result">
            {resultUrl ? (
              <div className="checker" style={{ padding: 8, borderRadius: 8 }}>
                <img src={resultUrl} alt="Seamless" style={{ maxWidth: '100%', maxHeight: 340, display: 'block' }} />
              </div>
            ) : (
              <div className="dim tiny">Press “Make seamless”.</div>
            )}
          </Panel>
        </div>
      )}
      {task.error && (
        <Notice tone="error" title="Could not process">
          {task.error}
        </Notice>
      )}
      {task.result && (
        <div className="grid-2">
          <Stat label="Output size" value={formatBytes(task.result.blob.size)} />
          <Stat label="Dimensions" value={`${task.result.width} × ${task.result.height}`} />
        </div>
      )}
    </ToolShell>
  );
}

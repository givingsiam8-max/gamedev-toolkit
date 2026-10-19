import { useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { ToolShell } from '../../../components/ToolShell';
import {
  Button,
  CheckBox,
  Field,
  Notice,
  Panel,
  Segmented,
  Select,
  Stat,
  useToast,
} from '../../../components/ui';
import { DropZone } from '../../../components/files';
import { useObjectUrl, useTask } from '../../../core/hooks';
import {
  analyseAlpha,
  canvasToBlob,
  context2d,
  createCanvas,
  imageDataToCanvas,
  loadImage,
} from '../../../core/image';
import { downloadBlob } from '../../../core/files';
import { formatBytes, formatNumber, stripExt } from '../../../core/format';
import { UserError } from '../../../core/errors';

type View = 'rgb' | 'red' | 'green' | 'blue' | 'alpha' | 'luminance' | 'pack';

const SOURCE_CHANNELS = ['R', 'G', 'B', 'A', 'Luminance', '0', '255'] as const;
type SourceChannel = (typeof SOURCE_CHANNELS)[number];

function readChannel(data: Uint8ClampedArray, i: number, source: SourceChannel): number {
  const r = data[i];
  const g = data[i + 1];
  const b = data[i + 2];
  const a = data[i + 3];
  switch (source) {
    case 'R':
      return r;
    case 'G':
      return g;
    case 'B':
      return b;
    case 'A':
      return a;
    case 'Luminance':
      return Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
    case '0':
      return 0;
    case '255':
      return 255;
  }
}

export default function ChannelViewer() {
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [view, setView] = useState<View>('rgb');
  const [invert, setInvert] = useState(false);
  const [packR, setPackR] = useState<SourceChannel>('R');
  const [packG, setPackG] = useState<SourceChannel>('G');
  const [packB, setPackB] = useState<SourceChannel>('B');
  const [packA, setPackA] = useState<SourceChannel>('A');
  const [stats, setStats] = useState<{ width: number; height: number; alpha: ReturnType<typeof analyseAlpha> } | null>(null);
  const sourceUrl = useObjectUrl(file);
  const task = useTask<{ blob: Blob; name: string; url: string }>();

  const render = () =>
    task.run(async () => {
      if (!file) throw new UserError('Add a texture first.');
      const image = await loadImage(file);
      try {
        const canvas = createCanvas(image.width, image.height);
        const ctx = context2d(canvas);
        ctx.drawImage(image.source, 0, 0);
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const src = data.data;
        const out = ctx.createImageData(data.width, data.height);
        const dst = out.data;

        if (view === 'rgb') {
          for (let i = 0; i < src.length; i += 1) {
            dst[i] = invert ? 255 - src[i] : src[i];
          }
        } else if (view === 'pack') {
          for (let i = 0; i < src.length; i += 4) {
            dst[i] = readChannel(src, i, packR);
            dst[i + 1] = readChannel(src, i, packG);
            dst[i + 2] = readChannel(src, i, packB);
            dst[i + 3] = readChannel(src, i, packA);
            if (invert) {
              dst[i] = 255 - dst[i];
              dst[i + 1] = 255 - dst[i + 1];
              dst[i + 2] = 255 - dst[i + 2];
              dst[i + 3] = 255 - dst[i + 3];
            }
          }
        } else {
          const map: Record<Exclude<View, 'rgb' | 'pack'>, SourceChannel> = {
            red: 'R',
            green: 'G',
            blue: 'B',
            alpha: 'A',
            luminance: 'Luminance',
          };
          const source = map[view];
          for (let i = 0; i < src.length; i += 4) {
            let value = readChannel(src, i, source);
            if (invert) value = 255 - value;
            dst[i] = value;
            dst[i + 1] = value;
            dst[i + 2] = value;
            dst[i + 3] = 255;
          }
        }

        const outCanvas = imageDataToCanvas(out);
        const blob = await canvasToBlob(outCanvas, 'image/png');
        setStats({ width: image.width, height: image.height, alpha: analyseAlpha(imageDataToCanvas(out) as unknown as ImageData) });
        return { blob, name: `${stripExt(file.name)}-${view}.png`, url: URL.createObjectURL(blob) };
      } finally {
        image.dispose();
      }
    });

  const onFiles = (files: File[]) => {
    const f = files[0];
    if (!f) return;
    setFile(f);
    task.reset();
    setStats(null);
  };

  const reset = () => {
    setFile(null);
    setView('rgb');
    setInvert(false);
    task.reset();
    setStats(null);
  };

  return (
    <ToolShell
      sidebar={
        <>
          <Field label="View">
            <Segmented
              options={[
                { value: 'rgb', label: 'RGB' },
                { value: 'red', label: 'R' },
                { value: 'green', label: 'G' },
                { value: 'blue', label: 'B' },
                { value: 'alpha', label: 'A' },
                { value: 'luminance', label: 'Luma' },
                { value: 'pack', label: 'Pack' },
              ]}
              value={view}
              onChange={(v) => {
                setView(v);
                task.reset();
              }}
            />
          </Field>
          <CheckBox checked={invert} onChange={setInvert} label="Invert output" />
          {view === 'pack' && (
            <Field label="Channel packing" hint="Each output channel can come from any source channel.">
              <div className="stack-sm">
                <Field label="Output R">
                  <Select options={SOURCE_CHANNELS.map((c) => ({ value: c, label: c }))} value={packR} onChange={(e) => setPackR(e.target.value as SourceChannel)} />
                </Field>
                <Field label="Output G">
                  <Select options={SOURCE_CHANNELS.map((c) => ({ value: c, label: c }))} value={packG} onChange={(e) => setPackG(e.target.value as SourceChannel)} />
                </Field>
                <Field label="Output B">
                  <Select options={SOURCE_CHANNELS.map((c) => ({ value: c, label: c }))} value={packB} onChange={(e) => setPackB(e.target.value as SourceChannel)} />
                </Field>
                <Field label="Output A">
                  <Select options={SOURCE_CHANNELS.map((c) => ({ value: c, label: c }))} value={packA} onChange={(e) => setPackA(e.target.value as SourceChannel)} />
                </Field>
              </div>
            </Field>
          )}
          <Notice tone="info">
            Channel packing is common in game pipelines: put roughness in G, metallic in B, and
            ambient occlusion in R to sample one texture in the shader.
          </Notice>
        </>
      }
      actions={
        <>
          <Button variant="ghost" icon={<RefreshCw />} onClick={reset}>
            Reset
          </Button>
          <Button variant="primary" loading={task.running} disabled={!file} onClick={render}>
            Apply view
          </Button>
          <Button
            variant="success"
            icon={<Download />}
            disabled={!task.result}
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
      info={stats ? `${formatNumber(stats.width)} × ${formatNumber(stats.height)}` : undefined}
    >
      {!file ? (
        <DropZone
          onFiles={onFiles}
          accept="image/*"
          formats={['PNG', 'JPG', 'WebP']}
          size="lg"
          multiple={false}
          title="Drop a texture"
        />
      ) : (
        <div className="grid-2">
          <Panel title="Source">
            {sourceUrl && <img src={sourceUrl} alt="Source" style={{ maxWidth: '100%', maxHeight: 360, display: 'block' }} />}
          </Panel>
          <Panel title="Channel view">
            {task.result ? (
              <img src={task.result.url} alt="Channel view" style={{ maxWidth: '100%', maxHeight: 360, display: 'block' }} />
            ) : (
              <div className="dim tiny">Pick a view and press “Apply view”.</div>
            )}
          </Panel>
        </div>
      )}
      {task.error && (
        <Notice tone="error" title="Could not render">
          {task.error}
        </Notice>
      )}
      {task.result && (
        <div className="grid-2">
          <Stat label="Output" value={formatBytes(task.result.blob.size)} />
          <Stat label="Mode" value={view.toUpperCase()} />
        </div>
      )}
    </ToolShell>
  );
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { ToolShell } from '../../../components/ToolShell';
import {
  Button,
  Field,
  Notice,
  Panel,
  SliderField,
  Stat,
} from '../../../components/ui';
import { DropZone } from '../../../components/files';
import { useTask } from '../../../core/hooks';
import { canvasToBlob, context2d, createCanvas, loadImage } from '../../../core/image';
import { downloadBlob } from '../../../core/files';
import { formatBytes, stripExt } from '../../../core/format';
import { UserError } from '../../../core/errors';

type Preset =
  | 'original'
  | 'vintage'
  | 'sepia'
  | 'monochrome'
  | 'cinematic'
  | 'warm'
  | 'cool'
  | 'contrast'
  | 'faded'
  | 'dramatic';

const FILTERS: Record<Preset, { label: string; filter: string }> = {
  original: { label: 'Original', filter: 'none' },
  vintage: { label: 'Vintage', filter: 'sepia(0.45) contrast(1.08) saturate(0.82) brightness(1.04)' },
  sepia: { label: 'Sepia', filter: 'sepia(0.9) contrast(1.05)' },
  monochrome: { label: 'Mono', filter: 'grayscale(1) contrast(1.12)' },
  cinematic: { label: 'Cinematic', filter: 'contrast(1.18) saturate(0.85) brightness(0.94) hue-rotate(-6deg)' },
  warm: { label: 'Warm', filter: 'sepia(0.18) saturate(1.18) brightness(1.04) hue-rotate(-8deg)' },
  cool: { label: 'Cool', filter: 'saturate(1.08) hue-rotate(9deg) brightness(1.02)' },
  contrast: { label: 'Punchy', filter: 'contrast(1.32) saturate(1.12)' },
  faded: { label: 'Faded', filter: 'contrast(0.82) saturate(0.78) brightness(1.08)' },
  dramatic: { label: 'Dramatic', filter: 'contrast(1.45) saturate(0.9) brightness(0.9)' },
};

export default function PhotoFilters() {
  const [file, setFile] = useState<File | null>(null);
  const [preset, setPreset] = useState<Preset>('vintage');
  const [strength, setStrength] = useState(75);
  const [info, setInfo] = useState<{ width: number; height: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sourceRef = useRef<HTMLCanvasElement | null>(null);
  const task = useTask<{ blob: Blob; name: string }>();

  const render = useCallback(() => {
    const source = sourceRef.current;
    const canvas = canvasRef.current;
    if (!source || !canvas) return;
    canvas.width = source.width;
    canvas.height = source.height;
    const ctx = context2d(canvas);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const filter = FILTERS[preset].filter;
    if (filter === 'none') {
      ctx.drawImage(source, 0, 0);
      return;
    }
    const amount = strength / 100;
    ctx.filter = filter;
    ctx.drawImage(source, 0, 0);
    ctx.filter = 'none';
    if (amount < 1) {
      ctx.globalAlpha = 1 - amount;
      ctx.drawImage(source, 0, 0);
      ctx.globalAlpha = 1;
    }
    setInfo({ width: canvas.width, height: canvas.height });
  }, [preset, strength]);

  useEffect(() => {
    if (file) render();
  }, [file, render]);

  const onFiles = async (files: File[]) => {
    const f = files[0];
    if (!f) return;
    const image = await loadImage(f);
    try {
      const source = createCanvas(image.width, image.height);
      context2d(source).drawImage(image.source, 0, 0);
      sourceRef.current = source;
      setFile(f);
      setInfo({ width: image.width, height: image.height });
      task.reset();
    } finally {
      image.dispose();
    }
  };

  const exportPng = () =>
    task.run(async () => {
      const canvas = canvasRef.current;
      if (!canvas || !file) throw new UserError('Add an image first.');
      const blob = await canvasToBlob(canvas, 'image/png');
      return { blob, name: `${stripExt(file.name)}-${preset}.png` };
    });

  const reset = () => {
    setFile(null);
    setPreset('vintage');
    setStrength(75);
    sourceRef.current = null;
    setInfo(null);
    task.reset();
  };

  return (
    <ToolShell
      sidebar={
        <>
          <Field label="Filter">
            <div className="stack-sm">
              {(Object.keys(FILTERS) as Preset[]).map((key) => (
                <Button
                  key={key}
                  size="sm"
                  variant={preset === key ? 'primary' : 'outline'}
                  onClick={() => setPreset(key)}
                  block
                >
                  {FILTERS[key].label}
                </Button>
              ))}
            </div>
          </Field>
          <SliderField
            label="Strength"
            value={strength}
            min={0}
            max={100}
            onChange={setStrength}
            format={(v) => `${v}%`}
            hint="Blends the filtered result with the original."
          />
          <Notice tone="info">
            Filters are CSS colour operations applied on the canvas — fast and non-destructive here,
            but they permanently bake into the exported PNG.
          </Notice>
        </>
      }
      actions={
        <>
          <Button variant="ghost" icon={<RefreshCw />} onClick={reset}>
            Reset
          </Button>
          <Button
            variant="success"
            icon={<Download />}
            disabled={!file}
            loading={task.running}
            onClick={async () => {
              const result = await exportPng();
              if (result) downloadBlob(result.blob, result.name);
            }}
          >
            Download PNG
          </Button>
        </>
      }
      info={info ? `${info.width} × ${info.height}` : undefined}
    >
      {!file ? (
        <DropZone
          onFiles={(files) => void onFiles(files)}
          accept="image/*"
          formats={['PNG', 'JPG', 'WebP']}
          size="lg"
          multiple={false}
          title="Drop an image to filter"
        />
      ) : (
        <Panel title="Preview">
          <div className="stage">
            <canvas ref={canvasRef} style={{ maxWidth: '100%', maxHeight: 500, display: 'block' }} />
          </div>
        </Panel>
      )}
      {task.error && (
        <Notice tone="error" title="Could not export">
          {task.error}
        </Notice>
      )}
      {task.result && (
        <div className="grid-2">
          <Stat label="Output" value={formatBytes(task.result.blob.size)} />
          <Stat label="Filter" value={FILTERS[preset].label} />
        </div>
      )}
    </ToolShell>
  );
}

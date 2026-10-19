import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Pipette, RefreshCw } from 'lucide-react';
import { ToolShell } from '../../../components/ToolShell';
import {
  Button,
  Field,
  Notice,
  Panel,
  Segmented,
  SliderField,
  Stat,
  TextInput,
} from '../../../components/ui';
import { DropZone } from '../../../components/files';
import { useTask } from '../../../core/hooks';
import { canvasToBlob, context2d, createCanvas, loadImage } from '../../../core/image';
import { downloadBlob } from '../../../core/files';
import { formatBytes, stripExt } from '../../../core/format';
import { hexToRgb, rgbToHex } from '../../../core/color';
import { UserError } from '../../../core/errors';

type Preset = 'white' | 'green' | 'custom';

export default function BackgroundRemover() {
  const [file, setFile] = useState<File | null>(null);
  const [preset, setPreset] = useState<Preset>('white');
  const [key, setKey] = useState('#ffffff');
  const [tolerance, setTolerance] = useState(28);
  const [feather, setFeather] = useState(18);
  const [info, setInfo] = useState<{ width: number; height: number; removed: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sourceRef = useRef<ImageData | null>(null);
  const task = useTask<{ blob: Blob; name: string }>();

  const effectiveKey = preset === 'green' ? '#00b140' : key;

  const process = useCallback(() => {
    const source = sourceRef.current;
    const canvas = canvasRef.current;
    if (!source || !canvas) return;
    const keyRgb = hexToRgb(effectiveKey) ?? { r: 255, g: 255, b: 255 };
    const out = new ImageData(new Uint8ClampedArray(source.data), source.width, source.height);
    const data = out.data;
    let removed = 0;
    for (let i = 0; i < data.length; i += 4) {
      const dr = data[i] - keyRgb.r;
      const dg = data[i + 1] - keyRgb.g;
      const db = data[i + 2] - keyRgb.b;
      const dist = Math.sqrt(dr * dr + dg * dg + db * db);
      if (dist <= tolerance) {
        data[i + 3] = 0;
        removed += 1;
      } else if (feather > 0 && dist <= tolerance + feather) {
        data[i + 3] = Math.round(data[i + 3] * ((dist - tolerance) / feather));
      }
    }
    canvas.width = source.width;
    canvas.height = source.height;
    context2d(canvas).putImageData(out, 0, 0);
    setInfo({ width: source.width, height: source.height, removed: removed / (source.width * source.height) });
  }, [effectiveKey, tolerance, feather]);

  useEffect(() => {
    if (file) process();
  }, [file, process]);

  const onFiles = async (files: File[]) => {
    const f = files[0];
    if (!f) return;
    const image = await loadImage(f);
    try {
      const canvas = createCanvas(image.width, image.height);
      const ctx = context2d(canvas);
      ctx.drawImage(image.source, 0, 0);
      sourceRef.current = ctx.getImageData(0, 0, image.width, image.height);
      setFile(f);
      task.reset();
    } finally {
      image.dispose();
    }
  };

  const pickColour = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.round(((event.clientX - rect.left) / rect.width) * canvas.width);
    const y = Math.round(((event.clientY - rect.top) / rect.height) * canvas.height);
    const ctx = context2d(canvas);
    const pixel = ctx.getImageData(Math.min(x, canvas.width - 1), Math.min(y, canvas.height - 1), 1, 1).data;
    setPreset('custom');
    setKey(rgbToHex({ r: pixel[0], g: pixel[1], b: pixel[2] }));
  };

  const exportPng = () =>
    task.run(async () => {
      const canvas = canvasRef.current;
      if (!canvas || !file) throw new UserError('Add an image first.');
      const blob = await canvasToBlob(canvas, 'image/png');
      return { blob, name: `${stripExt(file.name)}-cutout.png` };
    });

  const reset = () => {
    setFile(null);
    setPreset('white');
    setKey('#ffffff');
    setTolerance(28);
    setFeather(18);
    sourceRef.current = null;
    setInfo(null);
    task.reset();
  };

  return (
    <ToolShell
      sidebar={
        <>
          <Field label="Background preset">
            <Segmented
              options={[
                { value: 'white', label: 'White' },
                { value: 'green', label: 'Green' },
                { value: 'custom', label: 'Custom' },
              ]}
              value={preset}
              onChange={(v) => setPreset(v)}
            />
          </Field>
          {preset === 'custom' && (
            <Field label="Key colour" hint="Or click the image to sample it.">
              <TextInput value={key} onChange={(e) => setKey(e.target.value)} className="mono" />
            </Field>
          )}
          <SliderField label="Tolerance" value={tolerance} min={0} max={180} onChange={setTolerance} format={(v) => String(v)} hint="RGB distance treated as background." />
          <SliderField label="Feather" value={feather} min={0} max={80} onChange={setFeather} format={(v) => String(v)} hint="Softens the cut edge." />
          <Notice tone="warning" title="Colour keying, not AI segmentation">
            This removes pixels close to one colour. It works well on flat backgrounds (product
            shots, green screens, sprites on white) and poorly on busy ones. It cannot understand
            objects.
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
      info={info ? `${(info.removed * 100).toFixed(1)}% removed` : undefined}
    >
      {!file ? (
        <DropZone
          onFiles={(files) => void onFiles(files)}
          accept="image/*"
          formats={['PNG', 'JPG', 'WebP']}
          size="lg"
          multiple={false}
          title="Drop an image with a flat background"
        />
      ) : (
        <Panel
          title="Cutout preview"
          actions={
            <span className="row tiny dim">
              <Pipette style={{ width: 14, height: 14 }} /> click image to sample
            </span>
          }
        >
          <div className="stage checker">
            <canvas ref={canvasRef} onClick={pickColour} style={{ maxWidth: '100%', maxHeight: 480, cursor: 'crosshair' }} />
          </div>
        </Panel>
      )}
      {task.error && (
        <Notice tone="error" title="Could not export">
          {task.error}
        </Notice>
      )}
      {task.result && (
        <div className="grid-3">
          <Stat label="Removed" value={`${((info?.removed ?? 0) * 100).toFixed(1)}%`} />
          <Stat label="Output" value={formatBytes(task.result.blob.size)} />
          <Stat label="Key colour" value={effectiveKey.toUpperCase()} />
        </div>
      )}
    </ToolShell>
  );
}

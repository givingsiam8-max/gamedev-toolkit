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

type Kind = 'solid' | 'gradient' | 'blur' | 'transparent';

export default function BackgroundReplacer() {
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState<Kind>('solid');
  const [key, setKey] = useState('#ffffff');
  const [tolerance, setTolerance] = useState(28);
  const [colour, setColour] = useState('#1e293b');
  const [gradientA, setGradientA] = useState('#0ea5e9');
  const [gradientB, setGradientB] = useState('#8b5cf6');
  const [blur, setBlur] = useState(24);
  const [info, setInfo] = useState<{ width: number; height: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sourceRef = useRef<ImageData | null>(null);
  const task = useTask<{ blob: Blob; name: string }>();

  const render = useCallback(() => {
    const source = sourceRef.current;
    const canvas = canvasRef.current;
    if (!source || !canvas) return;
    const W = source.width;
    const H = source.height;
    canvas.width = W;
    canvas.height = H;
    const ctx = context2d(canvas);
    ctx.clearRect(0, 0, W, H);

    if (kind === 'solid') {
      ctx.fillStyle = colour;
      ctx.fillRect(0, 0, W, H);
    } else if (kind === 'gradient') {
      const gradient = ctx.createLinearGradient(0, 0, W, H);
      gradient.addColorStop(0, gradientA);
      gradient.addColorStop(1, gradientB);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, W, H);
    } else if (kind === 'blur') {
      const sourceCanvas = createCanvas(W, H);
      context2d(sourceCanvas).putImageData(source, 0, 0);
      ctx.save();
      ctx.filter = `blur(${blur}px)`;
      // Scale up slightly so the blur does not show transparent edges.
      const grow = blur * 2;
      ctx.drawImage(sourceCanvas, -grow, -grow, W + grow * 2, H + grow * 2);
      ctx.restore();
    }

    const keyRgb = hexToRgb(key) ?? { r: 255, g: 255, b: 255 };
    const layer = createCanvas(W, H);
    const lctx = context2d(layer);
    const out = new ImageData(new Uint8ClampedArray(source.data), W, H);
    const data = out.data;
    for (let i = 0; i < data.length; i += 4) {
      const dr = data[i] - keyRgb.r;
      const dg = data[i + 1] - keyRgb.g;
      const db = data[i + 2] - keyRgb.b;
      const dist = Math.sqrt(dr * dr + dg * dg + db * db);
      if (dist <= tolerance) data[i + 3] = 0;
      else if (dist <= tolerance + 18) data[i + 3] = Math.round(data[i + 3] * ((dist - tolerance) / 18));
    }
    lctx.putImageData(out, 0, 0);
    ctx.drawImage(layer, 0, 0);
    setInfo({ width: W, height: H });
  }, [kind, colour, gradientA, gradientB, blur, key, tolerance]);

  useEffect(() => {
    if (file) render();
  }, [file, render]);

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
    const pixel = context2d(canvas).getImageData(Math.min(x, canvas.width - 1), Math.min(y, canvas.height - 1), 1, 1).data;
    setKey(rgbToHex({ r: pixel[0], g: pixel[1], b: pixel[2] }));
  };

  const exportPng = () =>
    task.run(async () => {
      const canvas = canvasRef.current;
      if (!canvas || !file) throw new UserError('Add an image first.');
      const blob = await canvasToBlob(canvas, 'image/png');
      return { blob, name: `${stripExt(file.name)}-background.png` };
    });

  const reset = () => {
    setFile(null);
    setKind('solid');
    setKey('#ffffff');
    setTolerance(28);
    setColour('#1e293b');
    setGradientA('#0ea5e9');
    setGradientB('#8b5cf6');
    setBlur(24);
    sourceRef.current = null;
    setInfo(null);
    task.reset();
  };

  return (
    <ToolShell
      sidebar={
        <>
          <Field label="New background">
            <Segmented
              options={[
                { value: 'solid', label: 'Solid' },
                { value: 'gradient', label: 'Gradient' },
                { value: 'blur', label: 'Blurred' },
                { value: 'transparent', label: 'None' },
              ]}
              value={kind}
              onChange={(v) => setKind(v)}
            />
          </Field>
          {kind === 'solid' && (
            <Field label="Colour">
              <TextInput value={colour} onChange={(e) => setColour(e.target.value)} className="mono" />
            </Field>
          )}
          {kind === 'gradient' && (
            <>
              <Field label="Gradient start">
                <TextInput value={gradientA} onChange={(e) => setGradientA(e.target.value)} className="mono" />
              </Field>
              <Field label="Gradient end">
                <TextInput value={gradientB} onChange={(e) => setGradientB(e.target.value)} className="mono" />
              </Field>
            </>
          )}
          {kind === 'blur' && (
            <SliderField label="Blur radius" value={blur} min={4} max={80} onChange={setBlur} format={(v) => `${v}px`} />
          )}
          <Field label="Background key colour" hint="Pixels near this colour are replaced.">
            <TextInput value={key} onChange={(e) => setKey(e.target.value)} className="mono" />
          </Field>
          <SliderField label="Key tolerance" value={tolerance} min={0} max={180} onChange={setTolerance} format={(v) => String(v)} />
          <Notice tone="warning" title="Colour-key based">
            The replacement is masked by colour similarity, not by object detection. Busy original
            backgrounds will leave halos; flat ones work well.
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
          title="Drop an image to change its background"
        />
      ) : (
        <Panel
          title="Preview"
          actions={
            <span className="row tiny dim">
              <Pipette style={{ width: 14, height: 14 }} /> click to pick key colour
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
        <div className="grid-2">
          <Stat label="Output" value={formatBytes(task.result.blob.size)} />
          <Stat label="Background" value={kind} />
        </div>
      )}
    </ToolShell>
  );
}

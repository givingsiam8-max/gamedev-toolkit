import { useEffect, useRef, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { ToolShell } from '../../../components/ToolShell';
import {
  Button,
  Field,
  Notice,
  Panel,
  Segmented,
  SliderField,
  Stat,
  useToast,
} from '../../../components/ui';
import { DropZone } from '../../../components/files';
import { useTask } from '../../../core/hooks';
import { canvasToBlob, context2d, createCanvas, loadImage } from '../../../core/image';
import { formatBytes, stripExt } from '../../../core/format';
import { UserError } from '../../../core/errors';

type Mode = 'normal' | 'scalar';

export default function MapPreview() {
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<Mode>('normal');
  const [azimuth, setAzimuth] = useState(45);
  const [elevation, setElevation] = useState(45);
  const [intensity, setIntensity] = useState(1);
  const [gamma, setGamma] = useState(1);
  const [contrast, setContrast] = useState(1);
  const [plain, setPlain] = useState(true);
  const [info, setInfo] = useState<{ width: number; height: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const task = useTask<{ blob: Blob; name: string }>();
  const sourceRef = useRef<ImageData | null>(null);

  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    void (async () => {
      try {
        const image = await loadImage(file);
        if (cancelled) {
          image.dispose();
          return;
        }
        const canvas = createCanvas(image.width, image.height);
        const ctx = context2d(canvas);
        ctx.drawImage(image.source, 0, 0);
        sourceRef.current = ctx.getImageData(0, 0, image.width, image.height);
        setInfo({ width: image.width, height: image.height });
        image.dispose();
        draw(false);
      } catch {
        /* the notice below covers decode failures */
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  const draw = (exporting: boolean) => {
    const source = sourceRef.current;
    const canvas = canvasRef.current;
    if (!source || !canvas) return;
    canvas.width = source.width;
    canvas.height = source.height;
    const ctx = context2d(canvas);
    const out = ctx.createImageData(source.width, source.height);
    const src = source.data;
    const dst = out.data;

    const az = (azimuth * Math.PI) / 180;
    const el = (elevation * Math.PI) / 180;
    const lx = Math.cos(el) * Math.cos(az);
    const ly = Math.sin(el);
    const lz = Math.cos(el) * Math.sin(az);

    for (let i = 0; i < src.length; i += 4) {
      if (mode === 'normal' && !plain) {
        const nx = (src[i] / 255) * 2 - 1;
        const ny = (src[i + 1] / 255) * 2 - 1;
        const nz = (src[i + 2] / 255) * 2 - 1;
        const len = Math.hypot(nx, ny, nz) || 1;
        const lambert = Math.max(0, (nx / len) * lx + (ny / len) * ly + (nz / len) * lz);
        const shade = Math.min(1, 0.25 + 0.75 * lambert * intensity);
        const value = Math.round(shade * 255);
        dst[i] = value;
        dst[i + 1] = value;
        dst[i + 2] = value;
        dst[i + 3] = 255;
      } else if (mode === 'normal') {
        dst[i] = src[i];
        dst[i + 1] = src[i + 1];
        dst[i + 2] = src[i + 2];
        dst[i + 3] = 255;
      } else {
        const luma = 0.2126 * src[i] + 0.7152 * src[i + 1] + 0.0722 * src[i + 2];
        let v = 255 * Math.max(0, Math.min(1, Math.pow(luma / 255, gamma)));
        v = 255 * Math.max(0, Math.min(1, (v / 255 - 0.5) * contrast + 0.5));
        dst[i] = v;
        dst[i + 1] = v;
        dst[i + 2] = v;
        dst[i + 3] = 255;
      }
    }
    ctx.putImageData(out, 0, 0);
    if (exporting) {
      toast.info('Rendering preview…');
    }
  };

  const onFiles = (files: File[]) => {
    const f = files[0];
    if (!f) return;
    setFile(f);
    setInfo(null);
    sourceRef.current = null;
    task.reset();
  };

  const reset = () => {
    setFile(null);
    setMode('normal');
    setAzimuth(45);
    setElevation(45);
    setIntensity(1);
    setGamma(1);
    setContrast(1);
    setPlain(true);
    sourceRef.current = null;
    setInfo(null);
    task.reset();
  };

  const exportPng = () =>
    task.run(async () => {
      const canvas = canvasRef.current;
      if (!canvas || !file) throw new UserError('Add a map first.');
      draw(true);
      const blob = await canvasToBlob(canvas, 'image/png');
      return { blob, name: `${stripExt(file.name)}-preview.png` };
    });

  return (
    <ToolShell
      sidebar={
        <>
          <Field label="Map type">
            <Segmented
              options={[
                { value: 'normal', label: 'Normal map' },
                { value: 'scalar', label: 'Scalar map' },
              ]}
              value={mode}
              onChange={(v) => {
                setMode(v);
                draw(false);
              }}
            />
          </Field>

          {mode === 'normal' ? (
            <>
              <SliderField label="Light azimuth" value={azimuth} min={0} max={360} onChange={(v) => { setAzimuth(v); draw(false); }} format={(v) => `${v}°`} />
              <SliderField label="Light elevation" value={elevation} min={0} max={90} onChange={(v) => { setElevation(v); draw(false); }} format={(v) => `${v}°`} />
              <SliderField label="Light intensity" value={intensity} min={0} max={2} step={0.05} onChange={(v) => { setIntensity(v); draw(false); }} format={(v) => v.toFixed(2)} />
              <Field label="Display">
                <Segmented
                  options={[
                    { value: 'lit', label: 'Lit' },
                    { value: 'plain', label: 'Plain' },
                  ]}
                  value={plain ? 'plain' : 'lit'}
                  onChange={(v) => {
                    setPlain(v === 'plain');
                    draw(false);
                  }}
                />
              </Field>
            </>
          ) : (
            <>
              <SliderField label="Gamma" value={gamma} min={0.2} max={3} step={0.05} onChange={(v) => { setGamma(v); draw(false); }} format={(v) => v.toFixed(2)} />
              <SliderField label="Contrast" value={contrast} min={0.2} max={3} step={0.05} onChange={(v) => { setContrast(v); draw(false); }} format={(v) => v.toFixed(2)} />
              <Notice tone="info">
                Scalar maps (roughness, metallic, height, AO, emission) are shown as luminance. Tune
                gamma and contrast to judge the stored values; the export is a preview, not a
                replacement for the source.
              </Notice>
            </>
          )}
        </>
      }
      actions={
        <>
          <Button variant="ghost" icon={<RefreshCw />} onClick={reset}>
            Reset
          </Button>
          <Button variant="success" icon={<Download />} disabled={!file} loading={task.running} onClick={exportPng}>
            Export preview PNG
          </Button>
        </>
      }
      info={info ? `${info.width} × ${info.height}` : undefined}
    >
      {!file ? (
        <DropZone
          onFiles={onFiles}
          accept="image/*"
          formats={['PNG', 'JPG', 'WebP']}
          size="lg"
          multiple={false}
          title="Drop a normal or scalar map"
        />
      ) : (
        <Panel title="Preview">
          <div className="stage">
            <canvas ref={canvasRef} style={{ maxWidth: '100%', maxHeight: 420, imageRendering: 'auto' }} />
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
          <Stat label="Preview size" value={formatBytes(task.result.blob.size)} />
          <Stat label="Mode" value={mode === 'normal' ? 'Normal' : 'Scalar'} />
        </div>
      )}
      {file && (
        <Notice tone="warning" title="Visual check only">
          This lit view is a cheap lit-sphere approximation computed per pixel; it helps spot
          flipped or broken normals. It is not a full PBR render.
        </Notice>
      )}
    </ToolShell>
  );
}

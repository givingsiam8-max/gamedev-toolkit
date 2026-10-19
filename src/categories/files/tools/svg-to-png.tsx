import { useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { ToolShell } from '../../../components/ToolShell';
import { Button, Field, NumberInput, Notice, Panel, Segmented, Stat, TextInput, useToast } from '../../../components/ui';
import { DropZone } from '../../../components/files';
import { canvasToBlob, context2d, createCanvas } from '../../../core/image';
import { downloadBlob, readAsText } from '../../../core/files';
import { useObjectUrl, useTask } from '../../../core/hooks';
import { UserError } from '../../../core/errors';
import { formatBytes, replaceExt } from '../../../core/format';

const PRESETS = [16, 24, 32, 48, 64, 128, 256, 512, 1024];

function intrinsicSize(svg: string): { width: number; height: number } {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  if (doc.getElementsByTagName('parsererror').length) {
    throw new UserError('This SVG is not valid XML and cannot be rendered.');
  }
  const root = doc.documentElement;
  const vb = (root.getAttribute('viewBox') ?? '').split(/[\s,]+/).map(Number);
  if (vb.length === 4 && vb[2] > 0 && vb[3] > 0) return { width: vb[2], height: vb[3] };
  const w = parseFloat(root.getAttribute('width') ?? '');
  const h = parseFloat(root.getAttribute('height') ?? '');
  return { width: w > 0 ? w : 512, height: h > 0 ? h : 512 };
}

async function rasterize(svg: string, width: number, background: string): Promise<Blob> {
  const natural = intrinsicSize(svg);
  const height = Math.max(1, Math.round((width * natural.height) / natural.width));
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode().catch(() => {
      throw new UserError('The browser could not render this SVG.', 'Image decode failed');
    });
    const canvas = createCanvas(width, height);
    const ctx = context2d(canvas);
    if (background) {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, width, height);
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, width, height);
    return await canvasToBlob(canvas, 'image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function SvgToPng() {
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [svg, setSvg] = useState('');
  const previewUrl = useObjectUrl(svg ? new Blob([svg], { type: 'image/svg+xml' }) : null);
  const [width, setWidth] = useState(512);
  const [solid, setSolid] = useState(false);
  const [bg, setBg] = useState('#ffffff');
  const task = useTask<{ blob: Blob; name: string; width: number; height: number }>();

  const onFiles = async (files: File[]) => {
    const f = files[0];
    if (!f) return;
    try {
      const text = await readAsText(f);
      const natural = intrinsicSize(text);
      setSvg(text);
      setFile(f);
      setWidth(Math.round(natural.width));
      task.reset();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not read this SVG.');
    }
  };

  const convert = () =>
    task.run(async (report) => {
      if (!svg) throw new UserError('Choose an SVG file first.');
      if (width < 1 || width > 8192) throw new UserError('Width must be between 1 and 8192 pixels.');
      report(0.3, 'Rendering');
      const blob = await rasterize(svg, width, solid ? bg : '');
      report(1, 'Done');
      const height = Math.max(1, Math.round((width * intrinsicSize(svg).height) / intrinsicSize(svg).width));
      return { blob, name: replaceExt(file?.name ?? 'image.svg', 'png'), width, height };
    });

  const reset = () => {
    setFile(null);
    setSvg('');
    setWidth(512);
    setSolid(false);
    setBg('#ffffff');
    task.reset();
  };

  return (
    <ToolShell
      sidebar={
        <>
          <Field label="Output width (px)" hint="Height follows the SVG's aspect ratio.">
            <NumberInput value={width} min={1} max={8192} onChange={setWidth} />
          </Field>
          <Field label="Quick sizes">
            <div className="row-wrap">
              {PRESETS.map((p) => (
                <button key={p} type="button" className={`chip ${width === p ? 'chip-active' : ''}`} onClick={() => setWidth(p)}>
                  {p}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Background">
            <Segmented<'transparent' | 'solid'>
              options={[
                { value: 'transparent', label: 'Transparent' },
                { value: 'solid', label: 'Solid' },
              ]}
              value={solid ? 'solid' : 'transparent'}
              onChange={(v) => setSolid(v === 'solid')}
            />
          </Field>
          {solid && (
            <Field label="Colour">
              <TextInput value={bg} onChange={(e) => setBg(e.target.value)} className="mono" />
            </Field>
          )}
          <Notice tone="info" title="Rendering limits">
            SVGs that load external images or fonts, or rely on unsupported filters, may render differently from a desktop viewer.
          </Notice>
        </>
      }
      actions={
        <>
          <Button variant="ghost" icon={<RefreshCw />} onClick={reset}>
            Reset
          </Button>
          <Button variant="primary" loading={task.running} disabled={!svg} onClick={convert}>
            Convert to PNG
          </Button>
          <Button
            variant="success"
            icon={<Download />}
            disabled={!task.result}
            onClick={() => task.result && downloadBlob(task.result.blob, task.result.name)}
          >
            Download
          </Button>
        </>
      }
    >
      {!svg ? (
        <DropZone onFiles={onFiles} accept=".svg,image/svg+xml" multiple={false} formats={['SVG']} size="lg" title="Drop an SVG file" />
      ) : (
        <Panel title={file?.name ?? 'SVG'}>
          <div className="stage checker" style={{ minHeight: 220 }}>
            <img
              alt="SVG preview"
              src={previewUrl ?? undefined}
              style={{ maxWidth: '100%', maxHeight: 320, objectFit: 'contain' }}
            />
          </div>
        </Panel>
      )}
      {task.error && <Notice tone="error" title="Conversion failed">{task.error}</Notice>}
      {task.result && (
        <div className="grid-3">
          <Stat label="Output" value={`${task.result.width} × ${task.result.height}`} />
          <Stat label="PNG size" value={formatBytes(task.result.blob.size)} />
          <Stat label="Format" value="PNG" />
        </div>
      )}
    </ToolShell>
  );
}

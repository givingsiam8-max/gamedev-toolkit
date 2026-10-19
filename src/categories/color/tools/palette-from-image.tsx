import { useMemo, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { ToolShell } from '../../../components/ToolShell';
import {
  Button,
  CopyButton,
  Notice,
  Panel,
  SliderField,
  Stat,
  useToast,
} from '../../../components/ui';
import { DropZone } from '../../../components/files';
import { useObjectUrl, useTask } from '../../../core/hooks';
import { createCanvas, context2d, loadImage } from '../../../core/image';
import { extractPalette, luminanceToReadableText, rgbToHex, type RGB } from '../../../core/color';
import { downloadText } from '../../../core/files';
import { formatNumber, stripExt } from '../../../core/format';
import { UserError } from '../../../core/errors';

interface PaletteResult {
  colors: RGB[];
  sampled: number;
}

export default function PaletteFromImage() {
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [count, setCount] = useState(6);
  const [result, setResult] = useState<PaletteResult | null>(null);
  const sourceUrl = useObjectUrl(file);
  const task = useTask<PaletteResult>();

  const exportText = useMemo(() => {
    if (!result) return '';
    return JSON.stringify(
      {
        source: file?.name ?? 'image',
        colors: result.colors.map((c) => rgbToHex(c)),
      },
      null,
      2,
    );
  }, [result, file]);

  const analyse = () =>
    task.run(async () => {
      if (!file) throw new UserError('Add an image first.');
      const image = await loadImage(file);
      try {
        const max = 400;
        const scale = Math.min(max / image.width, max / image.height, 1);
        const canvas = createCanvas(
          Math.max(1, Math.round(image.width * scale)),
          Math.max(1, Math.round(image.height * scale)),
        );
        const ctx = context2d(canvas);
        ctx.drawImage(image.source, 0, 0, canvas.width, canvas.height);
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const colors = extractPalette(data, count);
        const sampled = canvas.width * canvas.height;
        setResult({ colors, sampled });
        return { colors, sampled };
      } finally {
        image.dispose();
      }
    });

  const onFiles = (files: File[]) => {
    const f = files[0];
    if (!f) return;
    setFile(f);
    setResult(null);
    task.reset();
  };

  const reset = () => {
    setFile(null);
    setCount(6);
    setResult(null);
    task.reset();
  };

  const copyColour = async (colour: RGB) => {
    const value = rgbToHex(colour);
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`Copied ${value}`);
    } catch {
      toast.error('Clipboard blocked by the browser.');
    }
  };

  return (
    <ToolShell
      sidebar={
        <>
          <SliderField
            label="Colours"
            value={count}
            min={2}
            max={12}
            onChange={(v) => {
              setCount(v);
              setResult(null);
              task.reset();
            }}
            format={(v) => String(v)}
            hint="Quantised into buckets; larger images are sampled at up to 400 px."
          />
          <Notice tone="info">
            The palette is frequency-weighted: large flat areas dominate. That is usually what you
            want for environment palettes, not for hero accents.
          </Notice>
        </>
      }
      actions={
        <>
          <Button variant="ghost" icon={<RefreshCw />} onClick={reset}>
            Reset
          </Button>
          <Button variant="primary" loading={task.running} disabled={!file} onClick={analyse}>
            Extract palette
          </Button>
          <Button
            variant="success"
            icon={<Download />}
            disabled={!result}
            onClick={() => {
              downloadText(exportText, `${stripExt(file?.name ?? 'palette')}.json`, 'application/json');
              toast.success('Palette exported.');
            }}
          >
            Export JSON
          </Button>
          <CopyButton value={exportText} />
        </>
      }
      info={result ? `${formatNumber(result.colors.length)} colours` : undefined}
    >
      {!file ? (
        <DropZone
          onFiles={onFiles}
          accept="image/*"
          formats={['PNG', 'JPG', 'WebP']}
          size="lg"
          multiple={false}
          title="Drop an image to extract its palette"
        />
      ) : (
        <div className="grid-2">
          <Panel title="Image">
            {sourceUrl && <img src={sourceUrl} alt="Source" style={{ maxWidth: '100%', maxHeight: 380, display: 'block' }} />}
          </Panel>
          <Panel title="Palette">
            {result ? (
              <div className="stack-sm">
                {result.colors.map((colour) => {
                  const value = rgbToHex(colour);
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => void copyColour(colour)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 10,
                        padding: '0 12px',
                        height: 42,
                        borderRadius: 8,
                        border: '1px solid var(--border-strong)',
                        background: value,
                        color: luminanceToReadableText(colour),
                        fontFamily: 'var(--font-mono)',
                        fontSize: 12.5,
                        cursor: 'pointer',
                      }}
                    >
                      <span>{value}</span>
                      <span style={{ opacity: 0.75 }}>click to copy</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="dim tiny">Press “Extract palette”.</div>
            )}
          </Panel>
        </div>
      )}
      {task.error && (
        <Notice tone="error" title="Could not analyse">
          {task.error}
        </Notice>
      )}
      {result && (
        <div className="grid-3">
          <Stat label="Colours" value={String(result.colors.length)} />
          <Stat label="Pixels sampled" value={formatNumber(result.sampled)} />
          <Stat label="Method" value="Bucket quantisation" sub="frequency-weighted" />
        </div>
      )}
    </ToolShell>
  );
}

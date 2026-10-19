import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Crop as CropIcon,
  Download,
  Eye,
  EyeOff,
  FlipHorizontal2,
  FlipVertical2,
  Image as ImageIcon,
  Redo2,
  RefreshCw,
  RotateCcw,
  RotateCw,
  ShieldCheck,
  SlidersHorizontal,
  Undo2,
  Wand2,
} from 'lucide-react';
import { ToolShell, MetaGrid } from '../../../components/ToolShell';
import {
  Badge,
  Button,
  CheckBox,
  Field,
  IconButton,
  Notice,
  NumberInput,
  Panel,
  ProgressBar,
  Segmented,
  Select,
  SliderField,
  Stat,
  Tabs,
  useToast,
} from '../../../components/ui';
import { CompareSlider, DropZone } from '../../../components/files';
import { useHotkey, useObjectUrl, useTask } from '../../../core/hooks';
import { canvasToBlob, context2d, createCanvas, loadImage, supportedEncodeTypes } from '../../../core/image';
import { downloadBlob } from '../../../core/files';
import { clamp, formatBytes, formatNumber, stripExt } from '../../../core/format';
import { toUserMessage } from '../../../core/errors';
import {
  ADJUST_KINDS,
  ADJUST_META,
  applyOps,
  defaultAdjustValues,
  describeOp,
  mergeAdjust,
  outputSize,
  pendingToOps,
  type AdjustKind,
  type Op,
  type Tab,
} from '../pipeline';

const PREVIEW_MAX = 1400;

interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const FULL_CROP: CropRect = { x: 0, y: 0, w: 1, h: 1 };

const FORMAT_OPTIONS = [
  { value: 'image/png', label: 'PNG — lossless, keeps transparency' },
  { value: 'image/jpeg', label: 'JPG — smaller, no transparency' },
  { value: 'image/webp', label: 'WebP — small, keeps transparency' },
  { value: 'image/avif', label: 'AVIF — smallest, where supported' },
];

const ASPECTS: Array<{ value: string; ratio: number | null }> = [
  { value: 'free', ratio: null },
  { value: '1:1', ratio: 1 },
  { value: '16:9', ratio: 16 / 9 },
  { value: '4:3', ratio: 4 / 3 },
  { value: '3:2', ratio: 3 / 2 },
];

function drawCropOverlay(ctx: CanvasRenderingContext2D, rect: CropRect, width: number, height: number) {
  const x = clamp(rect.x, 0, 1) * width;
  const y = clamp(rect.y, 0, 1) * height;
  const w = Math.max(1, clamp(rect.w, 0.001, 1 - rect.x) * width);
  const h = Math.max(1, clamp(rect.h, 0.001, 1 - rect.y) * height);
  const overlay = createCanvas(width, height);
  const octx = context2d(overlay);
  octx.fillStyle = 'rgba(6, 8, 12, 0.58)';
  octx.beginPath();
  octx.rect(0, 0, width, height);
  octx.rect(x, y, w, h);
  octx.fill('evenodd');
  ctx.drawImage(overlay, 0, 0);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, Math.max(0, w - 2), Math.max(0, h - 2));
}

export default function PhotoEditor() {
  const toast = useToast();
  const encodeTypes = useMemo(() => supportedEncodeTypes(), []);

  const [file, setFile] = useState<File | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [source, setSource] = useState<{
    canvas: HTMLCanvasElement;
    width: number;
    height: number;
    previewScale: number;
  } | null>(null);

  const [history, setHistory] = useState<{ entries: Op[][]; index: number }>({
    entries: [[]],
    index: 0,
  });
  const [pending, setPending] = useState<Record<AdjustKind, number>>(defaultAdjustValues);
  const [tab, setTab] = useState<Tab>('crop');
  const [crop, setCrop] = useState<CropRect>(FULL_CROP);
  const [aspect, setAspect] = useState('free');
  const [format, setFormat] = useState('image/png');
  const [quality, setQuality] = useState(92);
  const [compare, setCompare] = useState(false);
  const [beforeBlob, setBeforeBlob] = useState<Blob | null>(null);
  const [afterBlob, setAfterBlob] = useState<Blob | null>(null);
  const [target, setTarget] = useState({ width: 0, height: 0 });
  const [lockAspect, setLockAspect] = useState(true);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const task = useTask<{ blob: Blob; name: string; width: number; height: number }>();

  const ops = history.entries[history.index];
  const mergedOps = useMemo(() => mergeAdjust([...ops, ...pendingToOps(pending)]), [ops, pending]);
  const dirty = useMemo(() => pendingToOps(pending).length > 0, [pending]);

  const sourceDims = source ? { width: source.width, height: source.height } : { width: 0, height: 0 };
  const committedDims = useMemo(
    () => outputSize(sourceDims.width, sourceDims.height, ops),
    [sourceDims.width, sourceDims.height, ops],
  );
  const outputDims = useMemo(
    () => outputSize(sourceDims.width, sourceDims.height, mergedOps),
    [sourceDims.width, sourceDims.height, mergedOps],
  );

  /* ---------------------------------------------------------------- loading */

  useEffect(() => {
    if (!file) {
      setSource(null);
      setLoadError(null);
      return;
    }
    let cancelled = false;
    setLoadError(null);
    setSource(null);
    (async () => {
      const image = await loadImage(file);
      try {
        const scale = Math.min(1, PREVIEW_MAX / Math.max(image.width, image.height));
        const canvas = createCanvas(
          Math.max(1, Math.round(image.width * scale)),
          Math.max(1, Math.round(image.height * scale)),
        );
        const ctx = context2d(canvas);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(image.source, 0, 0, canvas.width, canvas.height);
        if (!cancelled) {
          setSource({ canvas, width: image.width, height: image.height, previewScale: canvas.width / image.width });
          setHistory({ entries: [[]], index: 0 });
          setPending(defaultAdjustValues());
          setCrop(FULL_CROP);
        }
      } finally {
        image.dispose();
      }
    })().catch((error) => {
      if (!cancelled) setLoadError(toUserMessage(error));
    });
    return () => {
      cancelled = true;
    };
  }, [file]);

  /* keep the resize fields in step with the current committed size */
  useEffect(() => {
    setTarget({ width: committedDims.width, height: committedDims.height });
  }, [committedDims.width, committedDims.height]);

  /* ------------------------------------------------------------- rendering */

  const renderPreview = useCallback(() => {
    const display = canvasRef.current;
    if (!source || !display) return;
    const output = applyOps(source.canvas, mergedOps, source.previewScale);
    display.width = output.width;
    display.height = output.height;
    const ctx = context2d(display);
    ctx.clearRect(0, 0, output.width, output.height);
    ctx.drawImage(output, 0, 0);
    if (tab === 'crop') drawCropOverlay(ctx, crop, output.width, output.height);
  }, [source, mergedOps, tab, crop]);

  useEffect(() => {
    const frame = requestAnimationFrame(renderPreview);
    return () => cancelAnimationFrame(frame);
  }, [renderPreview]);

  /* compare images are generated only while the compare view is open */
  useEffect(() => {
    if (!compare || !source) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        const output = applyOps(source.canvas, mergedOps, source.previewScale);
        const [before, after] = await Promise.all([
          canvasToBlob(source.canvas, 'image/png'),
          canvasToBlob(output, 'image/png'),
        ]);
        if (!cancelled) {
          setBeforeBlob(before);
          setAfterBlob(after);
        }
      })().catch(() => {
        /* preview encode failure is non-fatal; the live canvas stays visible */
      });
    }, 140);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [compare, source, mergedOps]);

  const beforeUrl = useObjectUrl(beforeBlob);
  const afterUrl = useObjectUrl(afterBlob);

  /* --------------------------------------------------------------- history */

  const commit = useCallback(
    (next: Op[]) => {
      setHistory((current) => ({
        entries: [...current.entries.slice(0, current.index + 1), mergeAdjust(next)],
        index: current.index + 1,
      }));
    },
    [],
  );

  const undo = useCallback(() => {
    setHistory((current) => (current.index > 0 ? { ...current, index: current.index - 1 } : current));
  }, []);

  const redo = useCallback(() => {
    setHistory((current) =>
      current.index < current.entries.length - 1 ? { ...current, index: current.index + 1 } : current,
    );
  }, []);

  const applyPending = () => {
    if (!dirty) return;
    commit([...ops, ...pendingToOps(pending)]);
    setPending(defaultAdjustValues());
    toast.success('Adjustments added to the edit history.');
  };

  const resetEdits = () => {
    setHistory({ entries: [[]], index: 0 });
    setPending(defaultAdjustValues());
    setCrop(FULL_CROP);
    setAspect('free');
    setCompare(false);
    task.reset();
    toast.info('Edits cleared. The loaded image is unchanged.');
  };

  const removeFile = () => {
    setFile(null);
    resetEdits();
  };

  /* ---------------------------------------------------------------- actions */

  const applyCrop = () => {
    if (!source) return;
    commit([...ops, { kind: 'crop', x: crop.x, y: crop.y, w: crop.w, h: crop.h }]);
    setCrop(FULL_CROP);
    toast.success('Crop added to the edit history.');
  };

  const applyResize = () => {
    if (!source || committedDims.width === 0) return;
    const sx = clamp(target.width, 1, 32768) / committedDims.width;
    const sy = clamp(target.height, 1, 32768) / committedDims.height;
    if (Math.abs(sx - 1) < 0.0001 && Math.abs(sy - 1) < 0.0001) {
      toast.warning('The target size is the same as the current size.');
      return;
    }
    commit([...ops, { kind: 'resize', sx, sy }]);
    toast.success('Resize added to the edit history.');
  };

  const rotate = (turns: 1 | 2 | 3) => commit([...ops, { kind: 'rotate', turns }]);
  const flip = (axis: 'x' | 'y') => commit([...ops, { kind: 'flip', axis }]);

  const setCropPx = (key: 'x' | 'y' | 'w' | 'h', value: number) => {
    if (!source || !Number.isFinite(value)) return;
    const dims = { w: committedDims.width, h: committedDims.height };
    setCrop((current) => {
      if (key === 'x') return { ...current, x: clamp(value / dims.w, 0, 1 - 0.01) };
      if (key === 'y') return { ...current, y: clamp(value / dims.h, 0, 1 - 0.01) };
      if (key === 'w') {
        const w = clamp(value / dims.w, 0.01, 1);
        const ratio = ASPECTS.find((item) => item.value === aspect)?.ratio ?? null;
        if (ratio && lockAspect) {
          const h = (w * dims.w) / ratio / dims.h;
          return { ...current, w, h: clamp(h, 0.01, 1) };
        }
        return { ...current, w: clamp(w, 0.01, 1 - current.x) };
      }
      const h = clamp(value / dims.h, 0.01, 1);
      const ratio = ASPECTS.find((item) => item.value === aspect)?.ratio ?? null;
      if (ratio && lockAspect) {
        const w = ((h * dims.h) * ratio) / dims.w;
        return { ...current, h, w: clamp(w, 0.01, 1) };
      }
      return { ...current, h: clamp(h, 0.01, 1 - current.y) };
    });
  };

  const chooseAspect = (value: string) => {
    setAspect(value);
    const ratio = ASPECTS.find((item) => item.value === value)?.ratio ?? null;
    if (!ratio || !source) return;
    setCrop((current) => {
      const pxWidth = current.w * committedDims.width;
      const pxHeight = pxWidth / ratio;
      const h = clamp(pxHeight / committedDims.height, 0.01, 1);
      return { ...current, h };
    });
  };

  const runExport = () =>
    task.run(async (report) => {
      if (!file || !source) throw new Error('Add an image before exporting.');
      report(0.02, 'Decoding the full-resolution image');
      const image = await loadImage(file);
      try {
        const base = createCanvas(image.width, image.height);
        const baseCtx = context2d(base);
        baseCtx.imageSmoothingEnabled = true;
        baseCtx.imageSmoothingQuality = 'high';
        baseCtx.drawImage(image.source, 0, 0);
        report(0.08, 'Replaying the edit list at full resolution');
        const output = applyOps(base, mergedOps, 1, (ratio) =>
          report(0.08 + ratio * 0.8, 'Replaying the edit list at full resolution'),
        );
        report(0.92, 'Encoding the result');
        const ext = format === 'image/png' ? 'png' : format === 'image/webp' ? 'webp' : format === 'image/avif' ? 'avif' : 'jpg';
        const blob = await canvasToBlob(output, format, format === 'image/png' ? undefined : quality / 100);
        report(1, 'Export ready');
        return { blob, name: `${stripExt(file.name)}-edited.${ext}`, width: output.width, height: output.height };
      } finally {
        image.dispose();
      }
    });

  const downloadResult = () => {
    if (!task.result) return;
    downloadBlob(task.result.blob, task.result.name);
    toast.success(`Exported ${task.result.name} (${formatBytes(task.result.blob.size)}).`);
  };

  useHotkey({ key: 'z', ctrl: true, shift: false }, undo, Boolean(file));
  useHotkey({ key: 'z', ctrl: true, shift: true }, redo, Boolean(file));
  useHotkey({ key: 'enter', ctrl: true }, () => void runExport(), Boolean(file) && !task.running);

  /* ------------------------------------------------------------------- UI */

  const cropPx = {
    x: Math.round(crop.x * committedDims.width),
    y: Math.round(crop.y * committedDims.height),
    w: Math.max(1, Math.round(crop.w * committedDims.width)),
    h: Math.max(1, Math.round(crop.h * committedDims.height)),
  };

  const tabControls = (): React.ReactNode => {
    if (tab === 'crop') {
      return (
        <div className="stack">
          <Field label="Aspect" hint={lockAspect ? 'Width and height stay linked for fixed aspects.' : undefined}>
            <Segmented
              size="sm"
              options={ASPECTS.map((item) => ({ value: item.value, label: item.value === 'free' ? 'Free' : item.value }))}
              value={aspect}
              onChange={chooseAspect}
            />
          </Field>
          <div className="grid-2">
            <Field label="X (px)">
              <NumberInput value={cropPx.x} min={0} max={committedDims.width} onChange={(v) => setCropPx('x', v)} />
            </Field>
            <Field label="Y (px)">
              <NumberInput value={cropPx.y} min={0} max={committedDims.height} onChange={(v) => setCropPx('y', v)} />
            </Field>
            <Field label="Width (px)">
              <NumberInput value={cropPx.w} min={1} max={committedDims.width} onChange={(v) => setCropPx('w', v)} />
            </Field>
            <Field label="Height (px)">
              <NumberInput value={cropPx.h} min={1} max={committedDims.height} onChange={(v) => setCropPx('h', v)} />
            </Field>
          </div>
          <CheckBox checked={lockAspect} onChange={setLockAspect} label="Lock aspect on width/height edits" />
          <div className="row-wrap">
            <Button size="sm" variant="outline" icon={<RotateCw />} onClick={() => rotate(1)}>
              90° CW
            </Button>
            <Button size="sm" variant="outline" icon={<RotateCcw />} onClick={() => rotate(3)}>
              90° CCW
            </Button>
            <Button size="sm" variant="outline" icon={<RotateCcw />} onClick={() => rotate(2)}>
              180°
            </Button>
          </div>
          <div className="row-wrap">
            <Button size="sm" variant="outline" icon={<FlipHorizontal2 />} onClick={() => flip('x')}>
              Flip horizontal
            </Button>
            <Button size="sm" variant="outline" icon={<FlipVertical2 />} onClick={() => flip('y')}>
              Flip vertical
            </Button>
          </div>
          <Button variant="primary" block icon={<CropIcon />} onClick={applyCrop}>
            Apply crop
          </Button>
        </div>
      );
    }

    if (tab === 'resize') {
      return (
        <div className="stack">
          <div className="grid-2">
            <Field label="Width (px)">
              <NumberInput
                value={target.width}
                min={1}
                max={32768}
                onChange={(value) => {
                  if (!Number.isFinite(value)) return;
                  setTarget((current) => ({
                    width: Math.round(value),
                    height: lockAspect ? Math.max(1, Math.round((value / committedDims.width) * committedDims.height)) : current.height,
                  }));
                }}
              />
            </Field>
            <Field label="Height (px)">
              <NumberInput
                value={target.height}
                min={1}
                max={32768}
                onChange={(value) => {
                  if (!Number.isFinite(value)) return;
                  setTarget((current) => ({
                    height: Math.round(value),
                    width: lockAspect ? Math.max(1, Math.round((value / committedDims.height) * committedDims.width)) : current.width,
                  }));
                }}
              />
            </Field>
          </div>
          <CheckBox checked={lockAspect} onChange={setLockAspect} label="Keep aspect ratio" />
          <Field label="Quick scale">
            <div className="row-wrap">
              {[25, 50, 75, 150, 200].map((percent) => (
                <Button
                  key={percent}
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setTarget({
                      width: Math.max(1, Math.round((committedDims.width * percent) / 100)),
                      height: Math.max(1, Math.round((committedDims.height * percent) / 100)),
                    })
                  }
                >
                  {percent}%
                </Button>
              ))}
            </div>
          </Field>
          <Button variant="primary" block icon={<Check />} onClick={applyResize}>
            Apply resize
          </Button>
          <div className="dim tiny">
            Current {formatNumber(committedDims.width)} × {formatNumber(committedDims.height)} px.
          </div>
        </div>
      );
    }

    const kinds = ADJUST_KINDS.filter((kind) => ADJUST_META[kind].tab === tab);
    return (
      <div className="stack">
        {kinds.map((kind) => {
          const meta = ADJUST_META[kind];
          return (
            <SliderField
              key={kind}
              label={meta.label}
              value={pending[kind]}
              min={meta.min}
              max={meta.max}
              step={meta.step}
              resetValue={0}
              format={
                kind === 'blur'
                  ? (value) => `${value} px`
                  : kind === 'hue'
                    ? (value) => `${Math.round(value)}°`
                    : (value) => `${value > 0 ? '+' : ''}${Math.round(value)}`
              }
              onChange={(value) => setPending((current) => ({ ...current, [kind]: value }))}
            />
          );
        })}
        <Button variant="primary" block icon={<Check />} disabled={!dirty} onClick={applyPending}>
          Apply changes
        </Button>
        <Button
          variant="ghost"
          block
          size="sm"
          disabled={!dirty}
          onClick={() => setPending(defaultAdjustValues())}
        >
          Reset sliders
        </Button>
      </div>
    );
  };

  const previewNode =
    compare && beforeUrl && afterUrl ? (
      <CompareSlider beforeUrl={beforeUrl} afterUrl={afterUrl} />
    ) : (
      <div className="stage checker" style={{ minHeight: 320 }}>
        {source ? (
          <canvas ref={canvasRef} aria-label="Edited image preview" />
        ) : (
          <div className="empty">
            <ImageIcon />
            <div className="empty-text">{loadError ? 'This image could not be decoded.' : 'Loading image…'}</div>
          </div>
        )}
      </div>
    );

  return (
    <ToolShell
      sidebar={
        <>
          {!file ? (
            <Notice tone="info" title="No image loaded">
              Drop a PNG, JPG or WebP image into the main area to start editing.
            </Notice>
          ) : (
            <>
              <MetaGrid
                rows={[
                  { label: 'Source', value: source ? `${formatNumber(source.width)} × ${formatNumber(source.height)}` : '—' },
                  { label: 'Aspect', value: source ? aspectRatioLabel(source.width, source.height) : '—' },
                  { label: 'Output', value: `${formatNumber(outputDims.width)} × ${formatNumber(outputDims.height)}` },
                  { label: 'Edits applied', value: formatNumber(ops.length) },
                ]}
              />
              <div className="row spread">
                <span className="truncate tiny" title={file.name}>
                  {file.name}
                </span>
                <IconButton label="Remove image" icon={<RefreshCw />} onClick={removeFile} />
              </div>

              <Field label="Export format">
                <Select
                  options={FORMAT_OPTIONS.map((option) => ({
                    ...option,
                    disabled: !encodeTypes[option.value],
                    label: encodeTypes[option.value] ? option.label : `${option.label} — not supported here`,
                  }))}
                  value={format}
                  onChange={(event) => setFormat(event.target.value)}
                />
              </Field>
              {format !== 'image/png' && (
                <SliderField
                  label="Quality"
                  value={quality}
                  min={10}
                  max={100}
                  step={1}
                  resetValue={92}
                  format={(value) => `${Math.round(value)}%`}
                  onChange={setQuality}
                />
              )}

              <Tabs
                tabs={[
                  { value: 'crop', label: 'Crop', icon: <CropIcon /> },
                  { value: 'resize', label: 'Resize', icon: <SlidersHorizontal /> },
                  { value: 'adjust', label: 'Adjust', icon: <Wand2 /> },
                  { value: 'color', label: 'Color', icon: <ShieldCheck /> },
                  { value: 'effects', label: 'Effects', icon: <Eye /> },
                ]}
                value={tab}
                onChange={setTab}
              />
              {tabControls()}

              <div className="spread">
                <span className="section-title">History</span>
                <span className="dim tiny">
                  step {history.index + 1} / {history.entries.length}
                </span>
              </div>
              <div className="stack-sm" style={{ maxHeight: 220, overflowY: 'auto' }}>
                {ops.length === 0 && <span className="dim tiny">No edits yet.</span>}
                {ops.map((op, index) => (
                  <div key={`${op.kind}-${index}`} className="spread">
                    <span className="tiny truncate">
                      {index + 1}. {describeOp(op)}
                    </span>
                    <IconButton
                      label={`Remove edit ${index + 1}`}
                      icon={<RefreshCw />}
                      onClick={() => commit(ops.filter((_, at) => at !== index))}
                    />
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      }
      actions={
        <>
          <Button
            variant="ghost"
            icon={<Undo2 />}
            disabled={history.index === 0}
            onClick={undo}
            title="Undo (Ctrl+Z)"
          >
            Undo
          </Button>
          <Button
            variant="ghost"
            icon={<Redo2 />}
            disabled={history.index >= history.entries.length - 1}
            onClick={redo}
            title="Redo (Ctrl+Shift+Z)"
          >
            Redo
          </Button>
          <Button variant="outline" icon={<Eye />} onClick={() => setCompare((value) => !value)} disabled={!source}>
            {compare ? 'Edit view' : 'Compare'}
          </Button>
          <Button variant="ghost" icon={<RotateCcw />} onClick={resetEdits} disabled={!file}>
            Reset edits
          </Button>
          <Button
            variant="primary"
            icon={<Download />}
            loading={task.running}
            disabled={!source}
            onClick={() => void runExport()}
            title="Export (Ctrl+Enter)"
          >
            Export
          </Button>
          <Button variant="success" icon={<Download />} disabled={!task.result} onClick={downloadResult}>
            Download
          </Button>
        </>
      }
      info={
        file ? (
          <span className="row tiny">
            <Badge tone="accent">{formatNumber(outputDims.width)} × {formatNumber(outputDims.height)} px</Badge>
            {source && source.previewScale < 1 && (
              <span className="dim">preview at {Math.round(source.previewScale * 100)}% — export is full resolution</span>
            )}
          </span>
        ) : undefined
      }
    >
      {!file ? (
        <DropZone
          onFiles={(files) => files[0] && setFile(files[0])}
          accept="image/*"
          multiple={false}
          title="Drop an image to edit"
          hint="PNG, JPG or WebP. Everything stays in your browser."
          formats={['PNG', 'JPG', 'WebP']}
          size="lg"
        />
      ) : (
        <Panel
          title="Preview"
          icon={compare ? <Eye /> : <SlidersHorizontal />}
          actions={
            <span className="row">
              <Badge tone={dirty ? 'warning' : 'neutral'}>{dirty ? 'Unapplied changes' : 'Up to date'}</Badge>
              <Button size="sm" variant="ghost" icon={compare ? <EyeOff /> : <Eye />} onClick={() => setCompare((value) => !value)}>
                {compare ? 'Edit view' : 'Before / after'}
              </Button>
            </span>
          }
        >
          <div className="stack">
            {previewNode}
            {loadError && (
              <Notice tone="error" title="Could not open this image">
                {loadError}
              </Notice>
            )}
            <div className="dim tiny">
              The preview renders at up to {formatNumber(PREVIEW_MAX)} px on the longest edge for speed. Exporting
              replays the same edit list on the full-resolution image.
            </div>
          </div>
        </Panel>
      )}

      {task.running && (
        <Panel title="Exporting">
          <ProgressBar value={task.progress} label={task.message} />
        </Panel>
      )}

      {task.error && (
        <Notice tone="error" title="Export failed">
          {task.error}
        </Notice>
      )}

      {task.result && (
        <>
          <div className="grid-3">
            <Stat label="Output size" value={`${formatNumber(task.result.width)} × ${formatNumber(task.result.height)}`} />
            <Stat label="File size" value={formatBytes(task.result.blob.size)} />
            <Stat label="Format" value={format.replace('image/', '').toUpperCase()} tone="ok" />
          </div>
          <Notice tone="success" title="Export ready">
            {task.result.name} — press Download to save it.
          </Notice>
        </>
      )}
    </ToolShell>
  );
}

function aspectRatioLabel(width: number, height: number): string {
  const divisor = (a: number, b: number): number => (b === 0 ? a : divisor(b, a % b));
  const d = divisor(width, height) || 1;
  const w = width / d;
  const h = height / d;
  if (w <= 40 && h <= 40) return `${w}:${h}`;
  return `${(width / height).toFixed(2)}:1`;
}

/**
 * Photo editor operation pipeline.
 *
 * Operations are plain serialisable objects — never ImageData — so an edit
 * history costs a few hundred bytes instead of megabytes. Every operation is
 * resolution independent (fractions or scale factors), which is what lets the
 * live preview run on a capped-size canvas while the export replays the exact
 * same list on the full-resolution canvas.
 */
import { createCanvas, context2d } from '../../core/image';

export type Tab = 'crop' | 'resize' | 'adjust' | 'color' | 'effects';

export const ADJUST_KINDS = [
  'brightness',
  'contrast',
  'exposure',
  'highlights',
  'shadows',
  'saturation',
  'temperature',
  'hue',
  'sepia',
  'grayscale',
  'blur',
  'sharpen',
  'clarity',
  'vignette',
] as const;

export type AdjustKind = (typeof ADJUST_KINDS)[number];

export interface AdjustMeta {
  label: string;
  min: number;
  max: number;
  step: number;
  tab: Tab;
  format?: (value: number) => string;
}

export const ADJUST_META: Record<AdjustKind, AdjustMeta> = {
  brightness: { label: 'Brightness', min: -100, max: 100, step: 1, tab: 'adjust' },
  contrast: { label: 'Contrast', min: -100, max: 100, step: 1, tab: 'adjust' },
  exposure: { label: 'Exposure', min: -100, max: 100, step: 1, tab: 'adjust' },
  highlights: { label: 'Highlights', min: -100, max: 100, step: 1, tab: 'adjust' },
  shadows: { label: 'Shadows', min: -100, max: 100, step: 1, tab: 'adjust' },
  saturation: { label: 'Saturation', min: -100, max: 100, step: 1, tab: 'color' },
  temperature: { label: 'Temperature', min: -100, max: 100, step: 1, tab: 'color' },
  hue: { label: 'Hue', min: -180, max: 180, step: 1, tab: 'color' },
  sepia: { label: 'Sepia', min: 0, max: 100, step: 1, tab: 'color' },
  grayscale: { label: 'Grayscale', min: 0, max: 100, step: 1, tab: 'color' },
  blur: { label: 'Blur', min: 0, max: 40, step: 0.5, tab: 'effects' },
  sharpen: { label: 'Sharpen', min: 0, max: 100, step: 1, tab: 'effects' },
  clarity: { label: 'Clarity', min: 0, max: 100, step: 1, tab: 'effects' },
  vignette: { label: 'Vignette', min: 0, max: 100, step: 1, tab: 'effects' },
};

export interface AdjustOp {
  kind: AdjustKind;
  value: number;
}
/** Crop rectangle as fractions (0..1) of the canvas at the time of applying. */
export interface CropOp {
  kind: 'crop';
  x: number;
  y: number;
  w: number;
  h: number;
}
/** Resize as scale factors, so the same op works at preview and full size. */
export interface ResizeOp {
  kind: 'resize';
  sx: number;
  sy: number;
}
export interface RotateOp {
  kind: 'rotate';
  /** Quarter turns clockwise: 1 = 90°, 2 = 180°, 3 = 270°. */
  turns: 1 | 2 | 3;
}
export interface FlipOp {
  kind: 'flip';
  axis: 'x' | 'y';
}

export type Op = AdjustOp | CropOp | ResizeOp | RotateOp | FlipOp;

export const isAdjustKind = (kind: string): kind is AdjustKind =>
  (ADJUST_KINDS as readonly string[]).includes(kind);

export function defaultAdjustValues(): Record<AdjustKind, number> {
  const values = {} as Record<AdjustKind, number>;
  for (const kind of ADJUST_KINDS) values[kind] = 0;
  return values;
}

export function pendingToOps(values: Record<AdjustKind, number>): AdjustOp[] {
  const ops: AdjustOp[] = [];
  for (const kind of ADJUST_KINDS) {
    if (values[kind] !== 0) ops.push({ kind, value: values[kind] });
  }
  return ops;
}

/**
 * Collapses repeated adjustments of the same kind so dragging a slider never
 * grows the op list. Structural ops (crop/resize/rotate/flip) keep their order.
 */
export function mergeAdjust(ops: Op[]): Op[] {
  const out: Op[] = [];
  const seen = new Map<AdjustKind, number>();
  for (const op of ops) {
    if (isAdjustKind(op.kind)) {
      const at = seen.get(op.kind);
      if (at !== undefined) {
        out[at] = op;
        continue;
      }
      seen.set(op.kind, out.length);
    }
    out.push(op);
  }
  return out;
}

function cloneCanvas(source: HTMLCanvasElement): HTMLCanvasElement {
  const canvas = createCanvas(source.width, source.height);
  context2d(canvas).drawImage(source, 0, 0);
  return canvas;
}

function applyCrop(source: HTMLCanvasElement, op: CropOp): HTMLCanvasElement {
  const sx = Math.round(source.width * op.x);
  const sy = Math.round(source.height * op.y);
  const sw = Math.max(1, Math.round(source.width * op.w));
  const sh = Math.max(1, Math.round(source.height * op.h));
  const x = Math.min(Math.max(0, sx), Math.max(0, source.width - 1));
  const y = Math.min(Math.max(0, sy), Math.max(0, source.height - 1));
  const w = Math.min(sw, source.width - x);
  const h = Math.min(sh, source.height - y);
  const canvas = createCanvas(w, h);
  context2d(canvas).drawImage(source, x, y, w, h, 0, 0, w, h);
  return canvas;
}

function applyResize(source: HTMLCanvasElement, op: ResizeOp): HTMLCanvasElement {
  const width = Math.max(1, Math.round(source.width * op.sx));
  const height = Math.max(1, Math.round(source.height * op.sy));
  const canvas = createCanvas(width, height);
  const ctx = context2d(canvas);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, width, height);
  return canvas;
}

function applyRotate(source: HTMLCanvasElement, op: RotateOp): HTMLCanvasElement {
  const swap = op.turns % 2 === 1;
  const canvas = createCanvas(swap ? source.height : source.width, swap ? source.width : source.height);
  const ctx = context2d(canvas);
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((op.turns * 90 * Math.PI) / 180);
  ctx.drawImage(source, -source.width / 2, -source.height / 2);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return canvas;
}

function applyFlip(source: HTMLCanvasElement, op: FlipOp): HTMLCanvasElement {
  const canvas = createCanvas(source.width, source.height);
  const ctx = context2d(canvas);
  ctx.translate(op.axis === 'x' ? canvas.width : 0, op.axis === 'y' ? canvas.height : 0);
  ctx.scale(op.axis === 'x' ? -1 : 1, op.axis === 'y' ? -1 : 1);
  ctx.drawImage(source, 0, 0);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return canvas;
}

/** CSS filter equivalent of an adjustment, when one exists. */
function cssFilter(op: AdjustOp, pixelScale: number): string | null {
  switch (op.kind) {
    case 'brightness':
      return `brightness(${1 + op.value / 100})`;
    case 'contrast':
      return `contrast(${1 + op.value / 100})`;
    case 'exposure':
      return `brightness(${2 ** (op.value / 100)})`;
    case 'saturation':
      return `saturate(${1 + op.value / 100})`;
    case 'hue':
      return `hue-rotate(${op.value}deg)`;
    case 'sepia':
      return `sepia(${op.value / 100})`;
    case 'grayscale':
      return `grayscale(${op.value / 100})`;
    case 'blur':
      return `blur(${(op.value * pixelScale).toFixed(2)}px)`;
    default:
      return null;
  }
}

function applyVignette(source: HTMLCanvasElement, op: AdjustOp): HTMLCanvasElement {
  const canvas = cloneCanvas(source);
  const ctx = context2d(canvas);
  const { width, height } = canvas;
  const strength = Math.min(1, Math.max(0, op.value / 100));
  const gradient = ctx.createRadialGradient(
    width / 2,
    height / 2,
    Math.min(width, height) * 0.32,
    width / 2,
    height / 2,
    Math.max(width, height) * 0.72,
  );
  gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
  gradient.addColorStop(1, `rgba(0, 0, 0, ${strength.toFixed(3)})`);
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  ctx.globalCompositeOperation = 'source-over';
  return canvas;
}

function applyTonePass(source: HTMLCanvasElement, op: AdjustOp): HTMLCanvasElement {
  const canvas = cloneCanvas(source);
  const ctx = context2d(canvas);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const p = data.data;

  if (op.kind === 'temperature') {
    const t = op.value / 100;
    const rGain = 1 + t * 0.22;
    const gGain = 1 + t * 0.04;
    const bGain = 1 - t * 0.22;
    for (let i = 0; i < p.length; i += 4) {
      p[i] = p[i] * rGain;
      p[i + 1] = p[i + 1] * gGain;
      p[i + 2] = p[i + 2] * bGain;
    }
  } else if (op.kind === 'highlights' || op.kind === 'shadows') {
    const amount = op.value / 100;
    const highlights = op.kind === 'highlights';
    for (let i = 0; i < p.length; i += 4) {
      const lum = (0.2126 * p[i] + 0.7152 * p[i + 1] + 0.0722 * p[i + 2]) / 255;
      const weight = highlights ? lum * lum : (1 - lum) * (1 - lum);
      const factor = 1 + amount * weight * 0.72;
      p[i] = p[i] * factor;
      p[i + 1] = p[i + 1] * factor;
      p[i + 2] = p[i + 2] * factor;
    }
  } else if (op.kind === 'sharpen') {
    const amount = op.value / 100;
    const copy = new Uint8ClampedArray(p);
    const { width, height } = canvas;
    const stride = width * 4;
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const i = y * stride + x * 4;
        for (let c = 0; c < 3; c += 1) {
          const centre = copy[i + c];
          const neighbours = copy[i + c - 4] + copy[i + c + 4] + copy[i + c - stride] + copy[i + c + stride];
          p[i + c] = centre + amount * (4 * centre - neighbours);
        }
      }
    }
  } else if (op.kind === 'clarity') {
    const amount = op.value / 100;
    const radius = Math.max(1, 2 + amount * 7);
    const blurred = createCanvas(canvas.width, canvas.height);
    const bctx = context2d(blurred);
    bctx.filter = `blur(${radius.toFixed(2)}px)`;
    bctx.drawImage(source, 0, 0);
    const b = bctx.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let i = 0; i < p.length; i += 4) {
      p[i] = p[i] + amount * 1.4 * (p[i] - b[i]);
      p[i + 1] = p[i + 1] + amount * 1.4 * (p[i + 1] - b[i + 1]);
      p[i + 2] = p[i + 2] + amount * 1.4 * (p[i + 2] - b[i + 2]);
    }
  }

  ctx.putImageData(data, 0, 0);
  return canvas;
}

function applyAdjust(source: HTMLCanvasElement, op: AdjustOp, pixelScale: number): HTMLCanvasElement {
  const filter = cssFilter(op, pixelScale);
  if (filter) {
    const canvas = createCanvas(source.width, source.height);
    const ctx = context2d(canvas);
    ctx.filter = filter;
    ctx.drawImage(source, 0, 0);
    ctx.filter = 'none';
    return canvas;
  }
  if (op.kind === 'vignette') return applyVignette(source, op);
  return applyTonePass(source, op);
}

function applyOp(source: HTMLCanvasElement, op: Op, pixelScale: number): HTMLCanvasElement {
  switch (op.kind) {
    case 'crop':
      return applyCrop(source, op);
    case 'resize':
      return applyResize(source, op);
    case 'rotate':
      return applyRotate(source, op);
    case 'flip':
      return applyFlip(source, op);
    default:
      return applyAdjust(source, op, pixelScale);
  }
}

/**
 * Replays the op list over a base canvas. `pixelScale` converts preview-space
 * pixel values (blur radius) to full-resolution pixels; it is 1 for export.
 */
export function applyOps(
  base: HTMLCanvasElement,
  ops: Op[],
  pixelScale = 1,
  onProgress?: (ratio: number) => void,
): HTMLCanvasElement {
  let canvas = base;
  ops.forEach((op, index) => {
    canvas = applyOp(canvas, op, pixelScale);
    onProgress?.((index + 1) / Math.max(1, ops.length));
  });
  return canvas;
}

/** Pixel dimensions of the full-resolution result after `ops`. */
export function outputSize(
  width: number,
  height: number,
  ops: Op[],
): { width: number; height: number } {
  let w = width;
  let h = height;
  for (const op of ops) {
    if (op.kind === 'crop') {
      w = Math.max(1, Math.round(w * op.w));
      h = Math.max(1, Math.round(h * op.h));
    } else if (op.kind === 'resize') {
      w = Math.max(1, Math.round(w * op.sx));
      h = Math.max(1, Math.round(h * op.sy));
    } else if (op.kind === 'rotate' && op.turns % 2 === 1) {
      const swap = w;
      w = h;
      h = swap;
    }
  }
  return { width: w, height: h };
}

export function describeOp(op: Op): string {
  switch (op.kind) {
    case 'crop':
      return `Crop ${Math.round(op.w * 100)}% × ${Math.round(op.h * 100)}%`;
    case 'resize':
      return `Resize ${Math.round(op.sx * 100)}%${op.sx !== op.sy ? ` × ${Math.round(op.sy * 100)}%` : ''}`;
    case 'rotate':
      return `Rotate ${op.turns * 90}° clockwise`;
    case 'flip':
      return op.axis === 'x' ? 'Flip horizontal' : 'Flip vertical';
    default: {
      const meta = ADJUST_META[op.kind];
      const sign = op.value > 0 ? '+' : '';
      return `${meta.label} ${sign}${op.value}${op.kind === 'blur' ? ' px' : op.kind === 'hue' ? '°' : ''}`;
    }
  }
}

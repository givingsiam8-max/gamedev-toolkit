/**
 * Canvas / image primitives shared by the image, texture, sprite and photo
 * tools. Everything here works on the user's machine — no uploads.
 */
import { UserError } from './errors';

export interface LoadedImage {
  /** Ready to draw: HTMLImageElement or ImageBitmap. */
  source: CanvasImageSource;
  width: number;
  height: number;
  /** Releases any object URL / bitmap backing store. */
  dispose: () => void;
}

export function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

export function context2d(
  canvas: HTMLCanvasElement,
  options?: CanvasRenderingContext2DSettings,
): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d', { willReadFrequently: true, ...options });
  if (!ctx) throw new UserError('Canvas 2D is not available in this browser.');
  return ctx;
}

/** Decodes any browser-supported image into a drawable source. */
export async function loadImage(input: Blob | string): Promise<LoadedImage> {
  let url: string;
  let owned = false;
  if (typeof input === 'string') {
    url = input;
  } else {
    url = URL.createObjectURL(input);
    owned = true;
  }

  const img = new Image();
  img.decoding = 'async';
  img.src = url;

  try {
    if (typeof img.decode === 'function') {
      await img.decode();
    } else {
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Image decode failed'));
      });
    }
  } catch (error) {
    if (owned) URL.revokeObjectURL(url);
    throw new UserError(
      'This image could not be decoded. It may be corrupt or use a format your browser cannot read.',
      error instanceof Error ? error.message : undefined,
    );
  }

  const width = img.naturalWidth || img.width;
  const height = img.naturalHeight || img.height;

  if (!width || !height) {
    if (owned) URL.revokeObjectURL(url);
    throw new UserError('This image has no readable pixel dimensions.');
  }

  return {
    source: img,
    width,
    height,
    dispose: () => {
      if (owned) URL.revokeObjectURL(url);
    },
  };
}

/** Turns a decoded image into ImageData without an intermediate canvas. */
export function imageToImageData(image: LoadedImage): ImageData {
  const canvas = createCanvas(image.width, image.height);
  const ctx = context2d(canvas);
  ctx.drawImage(image.source, 0, 0);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

export interface DrawOptions {
  /** Flat background painted before the image (used when dropping alpha). */
  background?: string;
  /** CSS filter string, e.g. "brightness(1.1) saturate(1.2)". */
  filter?: string;
  smoothing?: boolean;
  /** Transform applied around the canvas centre. */
  rotate?: number;
  flipX?: boolean;
  flipY?: boolean;
}

/**
 * Normalises an option set that keeps a scaled copy inside a frame, applying
 * an optional rotation, flip and background fill.
 */
export function renderToCanvas(
  image: LoadedImage,
  width: number,
  height: number,
  options: DrawOptions = {},
): HTMLCanvasElement {
  const canvas = createCanvas(width, height);
  const ctx = context2d(canvas);

  const { background, filter, smoothing = true, rotate = 0, flipX = false, flipY = false } = options;

  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  if (filter) ctx.filter = filter;
  ctx.imageSmoothingEnabled = smoothing;
  ctx.imageSmoothingQuality = 'high';

  const rotated = rotate % 180 !== 0;
  const boxW = rotated ? height : width;
  const boxH = rotated ? width : height;
  const scale = Math.min(boxW / image.width, boxH / image.height, Infinity);
  const drawW = image.width * scale;
  const drawH = image.height * scale;

  ctx.translate(width / 2, height / 2);
  ctx.rotate((rotate * Math.PI) / 180);
  ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
  ctx.drawImage(image.source, -drawW / 2, -drawH / 2, drawW, drawH);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.filter = 'none';

  return canvas;
}

/** Exact pixel resize with optional aspect preservation is handled by callers. */
export function resizeToCanvas(
  image: LoadedImage,
  width: number,
  height: number,
  options: DrawOptions & { cover?: boolean } = {},
): HTMLCanvasElement {
  const canvas = createCanvas(width, height);
  const ctx = context2d(canvas);
  const { background, filter, smoothing = true, cover = false } = options;

  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  if (filter) ctx.filter = filter;
  ctx.imageSmoothingEnabled = smoothing;
  ctx.imageSmoothingQuality = 'high';

  let dw = width;
  let dh = height;
  let dx = 0;
  let dy = 0;

  if (cover) {
    const scale = Math.max(width / image.width, height / image.height);
    dw = image.width * scale;
    dh = image.height * scale;
    dx = (width - dw) / 2;
    dy = (height - dh) / 2;
  } else {
    const scale = Math.min(width / image.width, height / image.height);
    dw = image.width * scale;
    dh = image.height * scale;
    dx = (width - dw) / 2;
    dy = (height - dh) / 2;
  }

  ctx.drawImage(image.source, dx, dy, dw, dh);
  ctx.filter = 'none';
  return canvas;
}

export function canvasToBlob(
  canvas: HTMLCanvasElement,
  type = 'image/png',
  quality?: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new UserError(`Your browser could not encode this image as ${type}.`));
          return;
        }
        if (type !== 'image/png' && blob.type && blob.type !== type) {
          reject(
            new UserError(
              `${type} export is not supported by this browser. Try PNG or JPG instead.`,
            ),
          );
          return;
        }
        resolve(blob);
      },
      type,
      quality,
    );
  });
}

/** Feature-detects which output formats this browser can actually encode. */
export function supportedEncodeTypes(): Record<string, boolean> {
  const probe = createCanvas(2, 2);
  const check = (type: string) => {
    try {
      return probe.toDataURL(type).startsWith(`data:${type}`);
    } catch {
      return false;
    }
  };
  return {
    'image/png': true,
    'image/jpeg': true,
    'image/webp': check('image/webp'),
    'image/avif': check('image/avif'),
  };
}

export function imageDataToCanvas(data: ImageData): HTMLCanvasElement {
  const canvas = createCanvas(data.width, data.height);
  context2d(canvas).putImageData(data, 0, 0);
  return canvas;
}

export function canvasToImageData(canvas: HTMLCanvasElement): ImageData {
  return context2d(canvas).getImageData(0, 0, canvas.width, canvas.height);
}

/** Nearest-neighbour scale — keeps pixel art crisp. */
export function scaleImageDataNearest(
  data: ImageData,
  width: number,
  height: number,
): ImageData {
  const src = createCanvas(data.width, data.height);
  context2d(src).putImageData(data, 0, 0);
  const dst = createCanvas(width, height);
  const ctx = context2d(dst);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, 0, 0, data.width, data.height, 0, 0, width, height);
  return ctx.getImageData(0, 0, width, height);
}

export interface AlphaInfo {
  hasAlpha: boolean;
  /** Ratio of fully or mostly transparent pixels, 0..1 */
  transparentRatio: number;
  minAlpha: number;
  maxAlpha: number;
}

export function analyseAlpha(data: ImageData, threshold = 250): AlphaInfo {
  const pixels = data.data;
  let transparent = 0;
  let min = 255;
  let max = 0;
  for (let i = 3; i < pixels.length; i += 4) {
    const a = pixels[i];
    if (a < min) min = a;
    if (a > max) max = a;
    if (a < threshold) transparent += 1;
  }
  const total = pixels.length / 4;
  return {
    hasAlpha: min < 255,
    transparentRatio: total ? transparent / total : 0,
    minAlpha: min,
    maxAlpha: max,
  };
}

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Bounding box of pixels that are not (near) transparent and not matching the
 * key colour — the basis of sprite trimming.
 */
export function findContentBounds(data: ImageData, alphaThreshold = 8): Bounds | null {
  const { width, height, data: pixels } = data;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const a = pixels[(y * width + x) * 4 + 3];
      if (a > alphaThreshold) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < 0) return null;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

export interface TilePlacement {
  canvas: HTMLCanvasElement;
  /** Optional trim rectangle inside the source canvas. */
  crop?: Bounds;
}

export interface SheetOptions {
  columns: number;
  rows: number;
  cellWidth: number;
  cellHeight: number;
  padding: number;
  margin: number;
  background?: string;
  trim?: boolean;
}

export interface SheetResult {
  canvas: HTMLCanvasElement;
  placements: (Bounds & { index: number })[];
}

/**
 * Lays tiles out on a single sheet. Shared by the sprite sheet, atlas and
 * GIF-frame tools so the geometry rules are identical everywhere.
 */
export function buildSheet(tiles: TilePlacement[], options: SheetOptions): SheetResult {
  const { columns, padding, margin, background, trim = false } = options;
  const rows = options.rows || Math.ceil(tiles.length / Math.max(1, columns));
  const cellWidth = options.cellWidth;
  const cellHeight = options.cellHeight;

  const width = margin * 2 + columns * cellWidth + Math.max(0, columns - 1) * padding;
  const height = margin * 2 + rows * cellHeight + Math.max(0, rows - 1) * padding;
  const canvas = createCanvas(width, height);
  const ctx = context2d(canvas);

  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);
  }

  const placements: (Bounds & { index: number })[] = [];
  let index = 0;

  for (const tile of tiles) {
    if (index >= columns * rows) break;
    const col = index % columns;
    const row = Math.floor(index / columns);
    const cellX = margin + col * (cellWidth + padding);
    const cellY = margin + row * (cellHeight + padding);

    let source = tile.canvas;
    let sourceBounds: Bounds = { x: 0, y: 0, width: source.width, height: source.height };

    if (trim) {
      const bounds = findContentBounds(canvasToImageData(source));
      if (bounds) sourceBounds = bounds;
    }
    if (tile.crop) sourceBounds = tile.crop;

    const scale = Math.min(
      cellWidth / sourceBounds.width,
      cellHeight / sourceBounds.height,
    );
    const drawW = sourceBounds.width * scale;
    const drawH = sourceBounds.height * scale;
    const dx = cellX + (cellWidth - drawW) / 2;
    const dy = cellY + (cellHeight - drawH) / 2;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(
      source,
      sourceBounds.x,
      sourceBounds.y,
      sourceBounds.width,
      sourceBounds.height,
      dx,
      dy,
      drawW,
      drawH,
    );

    placements.push({
      index,
      x: Math.round(dx),
      y: Math.round(dy),
      width: Math.round(drawW),
      height: Math.round(drawH),
    });
    index += 1;
  }

  return { canvas, placements };
}

export function computeFit(
  width: number,
  height: number,
  maxWidth: number,
  maxHeight: number,
): { width: number; height: number } {
  const scale = Math.min(maxWidth / width, maxHeight / height, 1);
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Reads the pixel colour at a point, or null when outside the canvas. */
export function pickPixel(
  canvas: HTMLCanvasElement,
  x: number,
  y: number,
): { r: number; g: number; b: number; a: number } | null {
  if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return null;
  const data = context2d(canvas).getImageData(Math.floor(x), Math.floor(y), 1, 1).data;
  return { r: data[0], g: data[1], b: data[2], a: data[3] };
}

/** Average colour of an image, ignoring transparent pixels. */
export function averageColor(data: ImageData): { r: number; g: number; b: number } {
  const pixels = data.data;
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] < 16) continue;
    r += pixels[i];
    g += pixels[i + 1];
    b += pixels[i + 2];
    count += 1;
  }
  if (!count) return { r: 0, g: 0, b: 0 };
  return { r: Math.round(r / count), g: Math.round(g / count), b: Math.round(b / count) };
}

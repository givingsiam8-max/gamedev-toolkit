/** GIF decoding helpers shared by the animation tools. */
import { decompressFrames, parseGIF } from 'gifuct-js';
import { UserError } from '../../core/errors';
import { context2d, createCanvas } from '../../core/image';

export interface GifFrame {
  image: ImageData;
  delay: number;
}

export interface DecodedGif {
  width: number;
  height: number;
  frames: GifFrame[];
}

/**
 * Decodes a GIF and composites every frame onto a full-size canvas, honouring
 * the disposal method (0/1 leave, 2 clear to background, 3 restore previous).
 */
export async function decodeGif(file: File): Promise<DecodedGif> {
  const buffer = await file.arrayBuffer();
  let parsed;
  try {
    parsed = parseGIF(buffer);
  } catch {
    throw new UserError('This file is not a readable GIF.');
  }
  const frames = decompressFrames(parsed, true);
  if (!frames.length) throw new UserError('This GIF contains no frames.');

  const width = parsed.lsd.width;
  const height = parsed.lsd.height;
  const canvas = createCanvas(width, height);
  const ctx = context2d(canvas);
  const out: GifFrame[] = [];

  for (const frame of frames) {
    const before = frame.disposalType === 3 ? ctx.getImageData(0, 0, width, height) : null;
    const patchCanvas = createCanvas(frame.dims.width, frame.dims.height);
    const patchCtx = context2d(patchCanvas);
    patchCtx.putImageData(
      new ImageData(new Uint8ClampedArray(frame.patch), frame.dims.width, frame.dims.height),
      0,
      0,
    );
    ctx.drawImage(patchCanvas, frame.dims.left, frame.dims.top);
    out.push({ image: ctx.getImageData(0, 0, width, height), delay: Math.max(20, frame.delay) });

    if (frame.disposalType === 2) {
      ctx.clearRect(frame.dims.left, frame.dims.top, frame.dims.width, frame.dims.height);
    } else if (frame.disposalType === 3 && before) {
      ctx.putImageData(before, 0, 0);
    }
  }

  return { width, height, frames: out };
}

export function totalDuration(gif: DecodedGif): number {
  return gif.frames.reduce((sum, frame) => sum + frame.delay, 0);
}

/** Multi-clip / multi-layer audio timeline model and mixdown. */
import { UserError } from '../../core/errors';

export interface AudioClip {
  id: string;
  name: string;
  /** Decoded source, never modified by timeline edits. */
  buffer: AudioBuffer;
  /** Position on the timeline, seconds. */
  start: number;
  /** Start inside the source buffer, seconds. */
  offset: number;
  /** Playable length, seconds. */
  duration: number;
}

export interface AudioLayer {
  id: string;
  name: string;
  /** 0–200 %. */
  volume: number;
  muted: boolean;
  solo: boolean;
  clips: AudioClip[];
}

let sequence = 0;

export function newAudioId(prefix: string): string {
  sequence += 1;
  return `${prefix}-${Date.now().toString(36)}-${sequence}`;
}

/** Copies layer and clip records while sharing the decoded source buffers. */
export function cloneLayers(layers: AudioLayer[]): AudioLayer[] {
  return layers.map((layer) => ({
    ...layer,
    clips: layer.clips.map((clip) => ({ ...clip })),
  }));
}

export function timelineEnd(layers: AudioLayer[]): number {
  let end = 0;
  for (const layer of layers) {
    for (const clip of layer.clips) end = Math.max(end, clip.start + clip.duration);
  }
  return end;
}

export function hasAudibleClips(layers: AudioLayer[]): boolean {
  return layers.some((layer) => !layer.muted && layer.clips.length > 0);
}

export function findClip(
  layers: AudioLayer[],
  clipId: string,
): { layer: AudioLayer; clip: AudioClip } | null {
  for (const layer of layers) {
    const clip = layer.clips.find((item) => item.id === clipId);
    if (clip) return { layer, clip };
  }
  return null;
}

/** Splits a clip at an absolute timeline position. Returns the right-hand piece. */
export function splitClip(
  clip: AudioClip,
  at: number,
): { left: AudioClip; right: AudioClip } | null {
  const relative = at - clip.start;
  if (relative <= 0.01 || relative >= clip.duration - 0.01) return null;
  return {
    left: { ...clip, duration: relative },
    right: {
      ...clip,
      id: newAudioId('clip'),
      start: at,
      offset: clip.offset + relative,
      duration: clip.duration - relative,
    },
  };
}

export function sourceStart(clip: AudioClip): number {
  return Math.max(0, Math.min(clip.offset, clip.buffer.duration));
}

export function clippedDuration(clip: AudioClip): number {
  return Math.max(
    0,
    Math.min(clip.duration, Math.max(0, clip.buffer.duration - clip.offset)),
  );
}

/** First position at or after `start` where a clip of `duration` fits. */
export function nextFreeStart(
  layer: AudioLayer,
  start: number,
  duration: number,
): number {
  let cursor = Math.max(0, start);
  let guard = 0;
  let changed = true;
  while (changed && guard < layer.clips.length + 2) {
    changed = false;
    guard += 1;
    for (const clip of layer.clips) {
      const end = clip.start + clip.duration;
      if (cursor < end - 1e-4 && cursor + duration > clip.start + 1e-4) {
        cursor = end;
        changed = true;
      }
    }
  }
  return cursor;
}

/**
 * Sums every audible layer into one buffer at `sampleRate`. Solo wins over mute
 * for non-soloed layers, and the result keeps stereo if any source is stereo.
 */
export function mixLayers(layers: AudioLayer[], sampleRate: number): AudioBuffer {
  const rate = Math.max(8000, Math.min(192000, Math.round(sampleRate || 48000)));
  const end = timelineEnd(layers);
  if (end <= 0) throw new UserError('Add at least one audio clip to the timeline.');
  const anySolo = layers.some(
    (layer) => layer.solo && !layer.muted && layer.clips.length > 0,
  );
  const audible = layers.filter(
    (layer) => !layer.muted && (!anySolo || layer.solo) && layer.clips.length > 0,
  );
  if (!audible.length) throw new UserError('Every layer is muted. Unmute a layer to mix.');

  const stereo = audible.some((layer) =>
    layer.clips.some((clip) => clip.buffer.numberOfChannels > 1),
  );
  const outputChannels = stereo ? 2 : 1;
  const length = Math.max(1, Math.ceil(end * rate));
  const output = new AudioBuffer({ length, numberOfChannels: outputChannels, sampleRate: rate });
  const target = Array.from({ length: outputChannels }, (_, index) =>
    output.getChannelData(index),
  );

  for (const layer of audible) {
    const gain = Math.max(0, Math.min(2, layer.volume / 100));
    if (gain === 0) continue;

    for (const clip of layer.clips) {
      const duration = clippedDuration(clip);
      if (duration <= 0) continue;
      const source = clip.buffer;
      const sourceChannels = Array.from({ length: source.numberOfChannels }, (_, index) =>
        source.getChannelData(index),
      );
      const startSample = Math.max(0, Math.floor(clip.start * rate));
      const endSample = Math.min(length, Math.ceil((clip.start + duration) * rate));
      if (endSample <= startSample) continue;

      const sameRate = source.sampleRate === rate;
      const sourceOffset = clip.offset * source.sampleRate;

      for (let outIndex = startSample; outIndex < endSample; outIndex += 1) {
        const local = outIndex / rate - clip.start;
        if (local < 0 || local >= duration) continue;
        const sourcePosition = sourceOffset + local * source.sampleRate;
        const index = Math.floor(sourcePosition);
        const fraction = sourcePosition - index;

        const read = (channel: number): number => {
          const data = sourceChannels[Math.min(channel, sourceChannels.length - 1)];
          if (!data) return 0;
          const a = data[Math.min(index, data.length - 1)] ?? 0;
          if (sameRate) return a;
          const b = data[Math.min(index + 1, data.length - 1)] ?? a;
          return a + (b - a) * fraction;
        };

        if (outputChannels === 1) {
          let value = 0;
          for (let channel = 0; channel < sourceChannels.length; channel += 1) {
            value += read(channel);
          }
          target[0][outIndex] += (value / sourceChannels.length) * gain;
        } else if (sourceChannels.length === 1) {
          const value = read(0) * gain;
          target[0][outIndex] += value;
          target[1][outIndex] += value;
        } else {
          target[0][outIndex] += read(0) * gain;
          target[1][outIndex] += read(1) * gain;
        }
      }

    }
  }

  return output;
}

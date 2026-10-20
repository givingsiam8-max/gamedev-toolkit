/** Shared audio editing engine for the Easy and Advanced editors. */
import { UserError } from '../../core/errors';
import { peakOf, sliceBuffer } from './audio';

export interface EditorSettings {
  trimStart: number;
  trimEnd: number;
  /** 0–1600 %. */
  volume: number;
  muted: boolean;
  /** 0.25–4. */
  speed: number;
  /** Semitones, -24…24. */
  pitch: number;
  fadeIn: number;
  fadeOut: number;
  normalize: boolean;
  compression: boolean;
  /** dBFS, -60…0. */
  threshold: number;
  /** 1…20. */
  ratio: number;
  eqLow: number;
  eqMid: number;
  eqHigh: number;
  /** 0 = source rate. */
  sampleRate: number;
  channels: 'source' | 'mono' | 'stereo';
  bitDepth: 16 | 24;
  sourceBpm: number;
  targetBpm: number;
}

export interface ExportResult {
  blob: Blob;
  name: string;
  size: number;
}

export const defaultEditorSettings = (duration: number): EditorSettings => ({
  trimStart: 0,
  trimEnd: duration,
  volume: 100,
  muted: false,
  speed: 1,
  pitch: 0,
  fadeIn: 0,
  fadeOut: 0,
  normalize: false,
  compression: false,
  threshold: -24,
  ratio: 4,
  eqLow: 0,
  eqMid: 0,
  eqHigh: 0,
  sampleRate: 0,
  channels: 'source',
  bitDepth: 16,
  sourceBpm: 120,
  targetBpm: 120,
});

export function volumeToDb(volume: number): number {
  if (volume <= 0) return -60;
  return Math.max(-60, Math.min(24, 20 * Math.log10(volume / 100)));
}

export function dbToVolume(db: number): number {
  return Math.min(1600, Math.max(0, 10 ** (db / 20) * 100));
}

export function formatTime(seconds: number, precise = false): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const minutes = Math.floor(seconds / 60);
  const rest = seconds - minutes * 60;
  if (precise) return `${minutes}:${rest.toFixed(3).padStart(6, '0')}`;
  return `${minutes}:${Math.floor(rest).toString().padStart(2, '0')}`;
}

function resampleLinear(input: AudioBuffer, targetLength: number): AudioBuffer {
  const out = new AudioBuffer({
    length: targetLength,
    numberOfChannels: input.numberOfChannels,
    sampleRate: input.sampleRate,
  });
  const ratio = input.length / targetLength;
  for (let channel = 0; channel < input.numberOfChannels; channel += 1) {
    const source = input.getChannelData(channel);
    const target = out.getChannelData(channel);
    for (let i = 0; i < targetLength; i += 1) {
      const position = i * ratio;
      const index = Math.floor(position);
      const fraction = position - index;
      const a = source[Math.min(index, input.length - 1)] ?? 0;
      const b = source[Math.min(index + 1, input.length - 1)] ?? a;
      target[i] = a + (b - a) * fraction;
    }
  }
  return out;
}

/** Overlap-add time stretch (approximate, pitch-preserving). */
function timeStretch(input: AudioBuffer, factor: number): AudioBuffer {
  if (Math.abs(factor - 1) < 0.001) return input;
  const outLength = Math.max(1, Math.round(input.length * factor));
  const out = new AudioBuffer({
    length: outLength,
    numberOfChannels: input.numberOfChannels,
    sampleRate: input.sampleRate,
  });
  const grain = Math.max(64, Math.min(Math.round(input.sampleRate * 0.06), input.length));
  const hopOut = Math.max(1, Math.floor(grain / 4));
  const hopIn = hopOut / factor;
  const window = new Float32Array(grain);
  for (let i = 0; i < grain; i += 1) {
    window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / Math.max(1, grain - 1));
  }

  for (let channel = 0; channel < input.numberOfChannels; channel += 1) {
    const source = input.getChannelData(channel);
    const target = out.getChannelData(channel);
    const normalise = new Float32Array(outLength);
    let outPos = 0;
    let inPos = 0;
    while (outPos < outLength) {
      const start = Math.round(inPos);
      for (let i = 0; i < grain; i += 1) {
        const sourceIndex = start + i;
        const targetIndex = outPos + i;
        if (sourceIndex >= input.length || targetIndex >= outLength) break;
        const weight = window[i];
        target[targetIndex] += source[sourceIndex] * weight;
        normalise[targetIndex] += weight;
      }
      outPos += hopOut;
      inPos += hopIn;
    }
    for (let i = 0; i < outLength; i += 1) {
      if (normalise[i] > 1e-5) target[i] /= normalise[i];
    }
  }
  return out;
}

function shiftPitch(input: AudioBuffer, semitones: number): AudioBuffer {
  if (Math.abs(semitones) < 0.01) return input;
  const ratio = 2 ** (semitones / 12);
  const shorter = resampleLinear(input, Math.max(1, Math.round(input.length / ratio)));
  return timeStretch(shorter, ratio);
}

async function applyEqAndCompression(
  input: AudioBuffer,
  settings: EditorSettings,
): Promise<AudioBuffer> {
  const hasEq = settings.eqLow !== 0 || settings.eqMid !== 0 || settings.eqHigh !== 0;
  if (!hasEq && !settings.compression) return input;

  const context = new OfflineAudioContext(
    input.numberOfChannels,
    input.length,
    input.sampleRate,
  );
  const source = context.createBufferSource();
  source.buffer = input;
  let node: AudioNode = source;

  const addFilter = (type: BiquadFilterType, frequency: number, gain: number, q?: number) => {
    if (gain === 0) return;
    const filter = context.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    filter.gain.value = gain;
    if (q !== undefined) filter.Q.value = q;
    node.connect(filter);
    node = filter;
  };

  addFilter('lowshelf', 200, settings.eqLow);
  addFilter('peaking', 1000, settings.eqMid, 1);
  addFilter('highshelf', 4000, settings.eqHigh);

  if (settings.compression) {
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = settings.threshold;
    compressor.knee.value = 6;
    compressor.ratio.value = settings.ratio;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.25;
    node.connect(compressor);
    node = compressor;
  }

  node.connect(context.destination);
  source.start();
  return context.startRendering();
}

function applyGainFadesNormalize(buffer: AudioBuffer, settings: EditorSettings): void {
  const gain = settings.muted ? 0 : settings.volume / 100;
  const fadeIn = Math.min(buffer.length, Math.floor(settings.fadeIn * buffer.sampleRate));
  const fadeOut = Math.min(buffer.length, Math.floor(settings.fadeOut * buffer.sampleRate));

  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < data.length; i += 1) {
      let sample = data[i] * gain;
      if (fadeIn > 0 && i < fadeIn) sample *= i / fadeIn;
      if (fadeOut > 0 && i >= data.length - fadeOut) {
        sample *= (data.length - 1 - i) / fadeOut;
      }
      data[i] = sample;
    }
  }

  if (settings.normalize) {
    const peak = peakOf(buffer);
    if (peak > 1e-6) {
      const scale = 0.891 / peak;
      for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
        const data = buffer.getChannelData(channel);
        for (let i = 0; i < data.length; i += 1) data[i] *= scale;
      }
    }
  }
}

function convertChannels(buffer: AudioBuffer, mode: EditorSettings['channels']): AudioBuffer {
  if (mode === 'source') return buffer;
  if (mode === 'mono') {
    if (buffer.numberOfChannels === 1) return buffer;
    const out = new AudioBuffer({ length: buffer.length, numberOfChannels: 1, sampleRate: buffer.sampleRate });
    const target = out.getChannelData(0);
    for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < data.length; i += 1) target[i] += data[i] / buffer.numberOfChannels;
    }
    return out;
  }
  if (buffer.numberOfChannels === 2) return buffer;
  const out = new AudioBuffer({ length: buffer.length, numberOfChannels: 2, sampleRate: buffer.sampleRate });
  if (buffer.numberOfChannels === 1) {
    out.copyToChannel(buffer.getChannelData(0), 0);
    out.copyToChannel(buffer.getChannelData(0), 1);
  } else {
    out.copyToChannel(buffer.getChannelData(0), 0);
    out.copyToChannel(buffer.getChannelData(1), 1);
  }
  return out;
}

function resampleToRate(input: AudioBuffer, rate: number): AudioBuffer {
  if (!rate || rate === input.sampleRate) return input;
  const length = Math.max(1, Math.round((input.length * rate) / input.sampleRate));
  const out = new AudioBuffer({
    length,
    numberOfChannels: input.numberOfChannels,
    sampleRate: rate,
  });
  const ratio = input.sampleRate / rate;
  for (let channel = 0; channel < input.numberOfChannels; channel += 1) {
    const source = input.getChannelData(channel);
    const target = out.getChannelData(channel);
    for (let i = 0; i < length; i += 1) {
      const position = i * ratio;
      const index = Math.floor(position);
      const fraction = position - index;
      const a = source[Math.min(index, source.length - 1)] ?? 0;
      const b = source[Math.min(index + 1, source.length - 1)] ?? a;
      target[i] = a + (b - a) * fraction;
    }
  }
  return out;
}

export async function renderEditedBuffer(
  base: AudioBuffer,
  settings: EditorSettings,
): Promise<AudioBuffer> {
  const start = Math.max(0, Math.min(settings.trimStart, base.duration));
  const end = Math.max(start, Math.min(settings.trimEnd, base.duration));
  if (end - start < 0.005) {
    throw new UserError('The selected region is too short. Move the start or end marker.');
  }

  let buffer = sliceBuffer(base, start, end);
  buffer = await applyEqAndCompression(buffer, settings);
  if (settings.pitch !== 0) buffer = shiftPitch(buffer, settings.pitch);
  if (settings.speed !== 1) buffer = timeStretch(buffer, 1 / settings.speed);
  applyGainFadesNormalize(buffer, settings);
  buffer = convertChannels(buffer, settings.channels);
  buffer = resampleToRate(buffer, settings.sampleRate);
  return buffer;
}

export function cutRegion(base: AudioBuffer, start: number, end: number): AudioBuffer {
  const from = Math.max(0, Math.min(base.length, Math.floor(start * base.sampleRate)));
  const to = Math.max(from, Math.min(base.length, Math.ceil(end * base.sampleRate)));
  const length = base.length - (to - from);
  if (length < 1) {
    throw new UserError('Cutting this region would remove the whole clip.');
  }
  const out = new AudioBuffer({
    length,
    numberOfChannels: base.numberOfChannels,
    sampleRate: base.sampleRate,
  });
  for (let channel = 0; channel < base.numberOfChannels; channel += 1) {
    const source = base.getChannelData(channel);
    const target = out.getChannelData(channel);
    target.set(source.subarray(0, from), 0);
    target.set(source.subarray(to), from);
  }
  return out;
}

export function splitBuffer(buffer: AudioBuffer, atSeconds: number): [AudioBuffer, AudioBuffer] {
  if (atSeconds <= 0.02 || atSeconds >= buffer.duration - 0.02) {
    throw new UserError('Move the playhead away from the start or end to split.');
  }
  return [sliceBuffer(buffer, 0, atSeconds), sliceBuffer(buffer, atSeconds, buffer.duration)];
}

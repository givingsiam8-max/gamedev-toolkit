/** Shared audio helpers: decode, WAV encoding, MP3 encoding and buffer utilities. */
import { UserError } from '../../core/errors';

const writeString = (view: DataView, offset: number, text: string): void => {
  for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
};

function floatToInt16(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i += 1) {
    const s = Math.max(-1, Math.min(1, input[i]));
    out[i] = s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff);
  }
  return out;
}

/** Decodes any browser-supported audio file into an AudioBuffer. */
export async function decodeAudio(file: File): Promise<AudioBuffer> {
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) throw new UserError('Web Audio is not available in this browser.');
  const context = new Ctor();
  try {
    const bytes = await file.arrayBuffer();
    try {
      return await context.decodeAudioData(bytes);
    } catch {
      throw new UserError(
        'This audio file could not be decoded. The format may not be supported by this browser.',
        `${file.name} (${file.type || 'unknown type'})`,
      );
    }
  } finally {
    await context.close().catch(() => undefined);
  }
}

/** PCM WAV with an optional mono downmix and 16- or 24-bit depth. */
export function encodeWav(
  buffer: AudioBuffer,
  options: { mono?: boolean; bitDepth?: 16 | 24 } = {},
): Blob {
  const channels = options.mono ? 1 : Math.min(2, buffer.numberOfChannels);
  const bitDepth = options.bitDepth === 24 ? 24 : 16;
  const bytesPerSample = bitDepth / 8;
  const frames = buffer.length;
  const dataLength = frames * channels * bytesPerSample;
  const out = new ArrayBuffer(44 + dataLength);
  const view = new DataView(out);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * channels * bytesPerSample, true);
  view.setUint16(32, channels * bytesPerSample, true);
  view.setUint16(34, bitDepth, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataLength, true);

  const source = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c));
  let offset = 44;
  for (let i = 0; i < frames; i += 1) {
    for (let c = 0; c < channels; c += 1) {
      let sample: number;
      if (options.mono && source.length > 1) {
        sample = source.reduce((sum, channel) => sum + channel[i], 0) / source.length;
      } else {
        sample = source[c][i];
      }
      const s = Math.max(-1, Math.min(1, sample));
      if (bitDepth === 16) {
        view.setInt16(offset, s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff), true);
        offset += 2;
      } else {
        const value = Math.max(-8388608, Math.min(8388607, Math.round(s * 8388607)));
        view.setUint8(offset, value & 0xff);
        view.setUint8(offset + 1, (value >> 8) & 0xff);
        view.setUint8(offset + 2, (value >> 16) & 0xff);
        offset += 3;
      }
    }
  }

  return new Blob([out], { type: 'audio/wav' });
}

/** MP3 encoding via lamejs; only available in the browser where the module loads. */
export async function encodeMp3(buffer: AudioBuffer, bitrate = 192, mono = false): Promise<Blob> {
  const { Mp3Encoder } = await import('@breezystack/lamejs');
  const channels = mono ? 1 : Math.min(2, buffer.numberOfChannels);
  if (channels < 1) throw new UserError('This audio buffer has no channels.');
  const left = floatToInt16(buffer.getChannelData(0));
  const right = channels > 1 ? floatToInt16(buffer.getChannelData(1)) : null;
  const encoder = new Mp3Encoder(channels, buffer.sampleRate, bitrate);
  const chunks: Uint8Array[] = [];
  const block = 1152;

  for (let i = 0; i < left.length; i += block) {
    const l = left.subarray(i, i + block);
    const r = right ? right.subarray(i, i + block) : undefined;
    const encoded = channels > 1 ? encoder.encodeBuffer(l, r) : encoder.encodeBuffer(l);
    if (encoded.length > 0) chunks.push(new Uint8Array(encoded));
  }
  const tail = encoder.flush();
  if (tail.length > 0) chunks.push(new Uint8Array(tail));

  return new Blob(chunks as BlobPart[], { type: 'audio/mpeg' });
}

export function sliceBuffer(buffer: AudioBuffer, startSeconds: number, endSeconds: number): AudioBuffer {
  const start = Math.max(0, Math.floor(startSeconds * buffer.sampleRate));
  const end = Math.min(buffer.length, Math.ceil(endSeconds * buffer.sampleRate));
  const length = Math.max(1, end - start);
  const out = new AudioBuffer({
    length,
    numberOfChannels: buffer.numberOfChannels,
    sampleRate: buffer.sampleRate,
  });
  for (let c = 0; c < buffer.numberOfChannels; c += 1) {
    out.copyToChannel(buffer.getChannelData(c).slice(start, start + length), c);
  }
  return out;
}

/** Peak absolute sample value across all channels. */
export function peakOf(buffer: AudioBuffer): number {
  let peak = 0;
  for (let c = 0; c < buffer.numberOfChannels; c += 1) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < data.length; i += 1) {
      const value = Math.abs(data[i]);
      if (value > peak) peak = value;
    }
  }
  return peak;
}

export function rmsOf(buffer: AudioBuffer): number {
  let sum = 0;
  let count = 0;
  const step = Math.max(1, Math.floor(buffer.length / 200000));
  for (let c = 0; c < buffer.numberOfChannels; c += 1) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < data.length; i += step) {
      sum += data[i] * data[i];
      count += 1;
    }
  }
  return count ? Math.sqrt(sum / count) : 0;
}

export const toDb = (value: number): number => (value <= 0 ? -Infinity : 20 * Math.log10(value));

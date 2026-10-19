import { useRef, useState } from 'react';
import { Download, RefreshCw, Volume2 } from 'lucide-react';
import { ToolShell } from '../../../components/ToolShell';
import {
  Button,
  CheckBox,
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
import { downloadBlob } from '../../../core/files';
import { formatBytes, formatDuration, formatNumber, stripExt } from '../../../core/format';
import { UserError } from '../../../core/errors';
import { decodeAudio, encodeMp3, encodeWav, peakOf, toDb } from '../audio';

type Format = 'wav' | 'mp3';

interface Meta {
  duration: number;
  sampleRate: number;
  channels: number;
  peak: number;
}

function processBuffer(
  buffer: AudioBuffer,
  gainDb: number,
  normalize: boolean,
  fadeIn: number,
  fadeOut: number,
  softClip: boolean,
): AudioBuffer {
  const peak = peakOf(buffer);
  let gain = 10 ** (gainDb / 20);
  if (normalize && peak > 0.0001) gain = Math.min(10, 1 / peak);

  const out = new AudioBuffer({
    length: buffer.length,
    numberOfChannels: buffer.numberOfChannels,
    sampleRate: buffer.sampleRate,
  });
  const fadeInSamples = Math.floor(fadeIn * buffer.sampleRate);
  const fadeOutSamples = Math.floor(fadeOut * buffer.sampleRate);
  const last = buffer.length - 1;

  for (let c = 0; c < buffer.numberOfChannels; c += 1) {
    const source = buffer.getChannelData(c);
    const target = out.getChannelData(c);
    for (let i = 0; i < source.length; i += 1) {
      let value = source[i] * gain;
      if (fadeInSamples > 0 && i < fadeInSamples) value *= i / fadeInSamples;
      if (fadeOutSamples > 0 && i > last - fadeOutSamples) value *= (last - i) / fadeOutSamples;
      if (softClip) value = Math.tanh(value);
      else value = Math.max(-1, Math.min(1, value));
      target[i] = value;
    }
  }
  return out;
}

export default function AudioGain() {
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [gainDb, setGainDb] = useState(0);
  const [normalize, setNormalize] = useState(false);
  const [fadeIn, setFadeIn] = useState(0);
  const [fadeOut, setFadeOut] = useState(0);
  const [softClip, setSoftClip] = useState(true);
  const [format, setFormat] = useState<Format>('wav');
  const bufferRef = useRef<AudioBuffer | null>(null);
  const decodeTask = useTask<Meta>();
  const exportTask = useTask<{ blob: Blob; name: string; peak: number }>();

  const onFiles = async (files: File[]) => {
    const f = files[0];
    if (!f) return;
    setFile(f);
    setMeta(null);
    bufferRef.current = null;
    exportTask.reset();
    await decodeTask.run(async () => {
      const buffer = await decodeAudio(f);
      bufferRef.current = buffer;
      const value = {
        duration: buffer.duration,
        sampleRate: buffer.sampleRate,
        channels: buffer.numberOfChannels,
        peak: peakOf(buffer),
      };
      setMeta(value);
      return value;
    });
  };

  const run = () =>
    exportTask.run(async () => {
      const buffer = bufferRef.current;
      if (!buffer || !file) throw new UserError('Add an audio file first.');
      const processed = processBuffer(buffer, gainDb, normalize, fadeIn, fadeOut, softClip);
      const peakAfter = peakOf(processed);
      const base = stripExt(file.name);
      const blob = format === 'mp3' ? await encodeMp3(processed, 192) : encodeWav(processed);
      return { blob, name: `${base}-leveled.${format}`, peak: peakAfter };
    });

  const reset = () => {
    bufferRef.current = null;
    setFile(null);
    setMeta(null);
    setGainDb(0);
    setNormalize(false);
    setFadeIn(0);
    setFadeOut(0);
    setSoftClip(true);
    setFormat('wav');
    decodeTask.reset();
    exportTask.reset();
  };

  return (
    <ToolShell
      sidebar={
        <>
          <SliderField label="Gain" value={gainDb} min={-30} max={30} step={0.5} onChange={setGainDb} format={(v) => `${v.toFixed(1)} dB`} />
          <CheckBox
            checked={normalize}
            onChange={setNormalize}
            label="Normalize peak"
            hint="Scales the whole file so the loudest sample reaches 0 dBFS. The gain slider is ignored when this is on."
          />
          <SliderField label="Fade in" value={fadeIn} min={0} max={Math.min(10, meta?.duration ?? 10)} step={0.05} onChange={setFadeIn} format={(v) => `${v.toFixed(2)} s`} />
          <SliderField label="Fade out" value={fadeOut} min={0} max={Math.min(10, meta?.duration ?? 10)} step={0.05} onChange={setFadeOut} format={(v) => `${v.toFixed(2)} s`} />
          <CheckBox checked={softClip} onChange={setSoftClip} label="Soft clip (tanh)" hint="Off hard-clips at ±1; on bends loud peaks instead of clipping squarely." />
          <Field label="Export format">
            <Segmented
              options={[
                { value: 'wav', label: 'WAV' },
                { value: 'mp3', label: 'MP3' },
              ]}
              value={format}
              onChange={(v) => setFormat(v)}
            />
          </Field>
          <Notice tone="info">
            Peak normalization does not make a track perceptually loud (that needs LUFS
            measurement); it only prevents clipping.
          </Notice>
        </>
      }
      actions={
        <>
          <Button variant="ghost" icon={<RefreshCw />} onClick={reset}>
            Reset
          </Button>
          <Button variant="primary" icon={<Volume2 />} loading={exportTask.running} disabled={!meta} onClick={run}>
            Apply
          </Button>
          <Button
            variant="success"
            icon={<Download />}
            disabled={!exportTask.result}
            onClick={() => {
              if (!exportTask.result) return;
              downloadBlob(exportTask.result.blob, exportTask.result.name);
              toast.success('Downloaded.');
            }}
          >
            Download
          </Button>
        </>
      }
      info={meta ? `peak ${toDb(meta.peak).toFixed(1)} dBFS` : undefined}
    >
      {!file ? (
        <DropZone
          onFiles={(files) => void onFiles(files)}
          accept="audio/*,.mp3,.wav,.ogg,.m4a"
          formats={['WAV', 'MP3', 'OGG']}
          size="lg"
          multiple={false}
          icon={<Volume2 />}
          title="Drop audio to adjust level"
        />
      ) : (
        <Panel title={file.name}>
          {decodeTask.running && <div className="dim tiny">Decoding…</div>}
          {decodeTask.error && (
            <Notice tone="error" title="Could not decode">
              {decodeTask.error}
            </Notice>
          )}
          {meta && (
            <div className="grid-4">
              <Stat label="Duration" value={formatDuration(meta.duration)} />
              <Stat label="Sample rate" value={`${formatNumber(meta.sampleRate)} Hz`} />
              <Stat label="Channels" value={String(meta.channels)} />
              <Stat label="Peak" value={`${toDb(meta.peak).toFixed(1)} dBFS`} tone={meta.peak >= 1 ? 'bad' : 'ok'} />
            </div>
          )}
        </Panel>
      )}
      {exportTask.error && (
        <Notice tone="error" title="Could not process">
          {exportTask.error}
        </Notice>
      )}
      {exportTask.result && (
        <div className="grid-3">
          <Stat label="Output peak" value={`${toDb(exportTask.result.peak).toFixed(1)} dBFS`} tone={exportTask.result.peak >= 0.999 ? 'warn' : 'ok'} />
          <Stat label="Output size" value={formatBytes(exportTask.result.blob.size)} />
          <Stat label="Format" value={format.toUpperCase()} />
        </div>
      )}
    </ToolShell>
  );
}

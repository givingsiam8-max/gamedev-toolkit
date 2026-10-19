import { useEffect, useRef, useState } from 'react';
import { Download, Play, RefreshCw, Scissors, Square } from 'lucide-react';
import { ToolShell } from '../../../components/ToolShell';
import {
  Button,
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
import { decodeAudio, encodeMp3, encodeWav, sliceBuffer } from '../audio';

type Format = 'wav' | 'mp3';

interface Meta {
  duration: number;
  sampleRate: number;
  channels: number;
}

export default function AudioTrimmer() {
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const [format, setFormat] = useState<Format>('wav');
  const [playing, setPlaying] = useState(false);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const playbackRef = useRef<AudioContext | null>(null);
  const decodeTask = useTask<Meta>();
  const exportTask = useTask<{ blob: Blob; name: string; duration: number }>();

  useEffect(
    () => () => {
      void playbackRef.current?.close().catch(() => undefined);
    },
    [],
  );

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
      const value = { duration: buffer.duration, sampleRate: buffer.sampleRate, channels: buffer.numberOfChannels };
      setMeta(value);
      setStart(0);
      setEnd(buffer.duration);
      return value;
    });
  };

  const play = async () => {
    const buffer = bufferRef.current;
    if (!buffer) return;
    void playbackRef.current?.close().catch(() => undefined);
    const context = new AudioContext();
    playbackRef.current = context;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    const length = Math.max(0.02, end - start);
    source.start(0, Math.min(start, buffer.duration), Math.min(length, buffer.duration - start));
    source.onended = () => {
      setPlaying(false);
      void context.close().catch(() => undefined);
    };
    setPlaying(true);
  };

  const stop = () => {
    void playbackRef.current?.close().catch(() => undefined);
    playbackRef.current = null;
    setPlaying(false);
  };

  const exportTrimmed = () =>
    exportTask.run(async () => {
      const buffer = bufferRef.current;
      if (!buffer || !file) throw new UserError('Add an audio file first.');
      if (end - start < 0.01) throw new UserError('The trimmed region is too short.');
      const trimmed = sliceBuffer(buffer, start, end);
      const base = stripExt(file.name);
      const blob = format === 'mp3' ? await encodeMp3(trimmed, 192) : encodeWav(trimmed);
      return {
        blob,
        name: `${base}-trimmed.${format}`,
        duration: trimmed.duration,
      };
    });

  const reset = () => {
    stop();
    bufferRef.current = null;
    setFile(null);
    setMeta(null);
    setStart(0);
    setEnd(0);
    setFormat('wav');
    decodeTask.reset();
    exportTask.reset();
  };

  return (
    <ToolShell
      sidebar={
        <>
          {meta && (
            <>
              <SliderField
                label="Start"
                value={start}
                min={0}
                max={meta.duration}
                step={0.01}
                onChange={(v) => setStart(Math.min(v, end - 0.01))}
                format={(v) => `${v.toFixed(2)} s`}
              />
              <SliderField
                label="End"
                value={end}
                min={0}
                max={meta.duration}
                step={0.01}
                onChange={(v) => setEnd(Math.max(v, start + 0.01))}
                format={(v) => `${v.toFixed(2)} s`}
              />
              <Field label="Selection">
                <div className="mono tiny">
                  {formatDuration(end - start)} · {formatNumber(Math.round((end - start) * meta.sampleRate))} samples
                </div>
              </Field>
            </>
          )}
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
          <div className="row">
            <Button size="sm" icon={playing ? <Square /> : <Play />} variant="outline" disabled={!meta} onClick={() => (playing ? stop() : void play())}>
              {playing ? 'Stop' : 'Preview'}
            </Button>
          </div>
          <Notice tone="info">
            Preview plays the selected region through your system audio. Export is 16-bit WAV or
            lossy MP3 at 192 kbps.
          </Notice>
        </>
      }
      actions={
        <>
          <Button variant="ghost" icon={<RefreshCw />} onClick={reset}>
            Reset
          </Button>
          <Button
            variant="primary"
            icon={<Scissors />}
            loading={exportTask.running}
            disabled={!meta}
            onClick={exportTrimmed}
          >
            Trim
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
      info={meta ? formatDuration(meta.duration) : undefined}
    >
      {!file ? (
        <DropZone
          onFiles={(files) => void onFiles(files)}
          accept="audio/*,.mp3,.wav,.ogg,.m4a"
          formats={['WAV', 'MP3', 'OGG']}
          size="lg"
          multiple={false}
          icon={<Scissors />}
          title="Drop audio to trim"
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
            <div className="grid-3">
              <Stat label="Duration" value={formatDuration(meta.duration)} />
              <Stat label="Sample rate" value={`${formatNumber(meta.sampleRate)} Hz`} />
              <Stat label="Channels" value={String(meta.channels)} />
            </div>
          )}
        </Panel>
      )}
      {exportTask.error && (
        <Notice tone="error" title="Could not export">
          {exportTask.error}
        </Notice>
      )}
      {exportTask.result && (
        <div className="grid-3">
          <Stat label="Trimmed length" value={formatDuration(exportTask.result.duration)} />
          <Stat label="Output" value={formatBytes(exportTask.result.blob.size)} />
          <Stat label="Format" value={format.toUpperCase()} />
        </div>
      )}
    </ToolShell>
  );
}

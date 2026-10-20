import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import {
  Download,
  Music,
  Pause,
  Play,
  Redo2,
  RefreshCw,
  Scissors,
  Slice,
  Undo2,
} from 'lucide-react';
import { ToolShell } from '../../components/ToolShell';
import {
  Badge,
  Button,
  BusyOverlay,
  Field,
  Notice,
  NumberInput,
  Panel,
  SectionTitle,
  Select,
  Spinner,
  Stat,
  SwitchRow,
  useToast,
} from '../../components/ui';
import { DropZone } from '../../components/files';
import { useAnimationFrame, useTask } from '../../core/hooks';
import { downloadBlob, zipFiles } from '../../core/files';
import { clamp, formatBytes, stripExt } from '../../core/format';
import { toUserMessage } from '../../core/errors';
import { decodeAudio, encodeMp3, encodeWav } from './audio';
import {
  cutRegion,
  dbToVolume,
  defaultEditorSettings,
  formatTime,
  renderEditedBuffer,
  splitBuffer,
  volumeToDb,
  type EditorSettings,
} from './editor';

type Variant = 'easy' | 'advanced';
type OutputFormat = 'wav' | 'mp3';

interface Snapshot {
  buffer: AudioBuffer;
  settings: EditorSettings;
}

interface History {
  past: Snapshot[];
  future: Snapshot[];
}

interface OutputFile {
  name: string;
  blob: Blob;
}

const MAX_AUDIO_BYTES = 100 * 1024 * 1024;
const MAX_HISTORY = 40;

function AudioSlider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  onStart,
  format,
  hint,
  disabled,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  onStart?: () => void;
  format?: (value: number) => string;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <div className="field">
      <div className="field-label">
        <span>{label}</span>
        {format && <span className="dim tiny mono">{format(value)}</span>}
      </div>
      <div className="range-row">
        <input
          type="range"
          className="range"
          value={clamp(value, min, max)}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          onPointerDown={onStart}
          onKeyDown={(event) => {
            if (
              event.key.startsWith('Arrow') ||
              event.key === 'Home' ||
              event.key === 'End' ||
              event.key === 'PageUp' ||
              event.key === 'PageDown'
            ) {
              onStart?.();
            }
          }}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        <input
          type="number"
          className="range-value"
          value={Number.isFinite(value) ? Number(value.toFixed(3)) : ''}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          onFocus={onStart}
          onChange={(event) => {
            if (event.target.value === '') return;
            onChange(clamp(Number(event.target.value), min, max));
          }}
        />
      </div>
      {hint && <div className="field-hint">{hint}</div>}
    </div>
  );
}

export function AudioEditor({ variant }: { variant: Variant }) {
  const advanced = variant === 'advanced';
  const toast = useToast();

  const [file, setFile] = useState<File | null>(null);
  const [pendingName, setPendingName] = useState<string | null>(null);
  const [base, setBase] = useState<AudioBuffer | null>(null);
  const [settings, setSettings] = useState<EditorSettings | null>(null);
  const [preview, setPreview] = useState<AudioBuffer | null>(null);
  const [format, setFormat] = useState<OutputFormat>('wav');
  const [bitrate, setBitrate] = useState(192);
  const [processing, setProcessing] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [playhead, setPlayhead] = useState(0);
  const [history, setHistory] = useState<History>({ past: [], future: [] });
  const [splitFiles, setSplitFiles] = useState<OutputFile[]>([]);
  const [exportInfo, setExportInfo] = useState<{ name: string; size: number } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [splitting, setSplitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const decodeTask = useTask<AudioBuffer>();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const timeTextRef = useRef<HTMLSpanElement | null>(null);
  const previewRef = useRef<AudioBuffer | null>(null);
  const playheadRef = useRef(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const startedAtRef = useRef(0);

  const baseName = useMemo(() => (file ? stripExt(file.name) : 'audio'), [file]);
  const fadeMax = base ? Math.max(0.05, Math.min(advanced ? 10 : 5, base.duration)) : 5;
  const sampleRateOptions = useMemo(
    () => [
      { value: '0', label: `Source (${base?.sampleRate ?? 44100} Hz)` },
      { value: '22050', label: '22,050 Hz' },
      { value: '32000', label: '32,000 Hz' },
      { value: '44100', label: '44,100 Hz' },
      { value: '48000', label: '48,000 Hz' },
      { value: '96000', label: '96,000 Hz' },
    ],
    [base],
  );

  const messageOf = useCallback((value: unknown) => toUserMessage(value), []);

  useEffect(() => {
    const previous = document.title;
    document.title = `${advanced ? 'Advanced' : 'Easy'} Audio Editor — GameDev Toolkit`;
    return () => {
      document.title = previous;
    };
  }, [advanced]);

  const stopPlayback = useCallback(() => {
    const source = sourceRef.current;
    sourceRef.current = null;
    if (source) {
      source.onended = null;
      try {
        source.stop();
      } catch {
        /* already stopped */
      }
      source.disconnect();
    }
    const ctx = audioCtxRef.current;
    audioCtxRef.current = null;
    if (ctx) void ctx.close().catch(() => undefined);
    setPlaying(false);
  }, []);

  const updateTimeLabel = useCallback(() => {
    if (!timeTextRef.current) return;
    const duration = previewRef.current?.duration ?? 0;
    timeTextRef.current.textContent = `${formatTime(playheadRef.current, true)} / ${formatTime(duration, true)}`;
  }, []);

  const drawWaveform = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);
    const buffer = previewRef.current;
    if (!buffer) return;

    ctx.fillStyle = 'rgba(148, 163, 184, 0.06)';
    ctx.fillRect(0, 0, width, height);

    const columns = width;
    const block = Math.max(1, Math.floor(buffer.length / columns));
    const step = Math.max(1, Math.floor(block / 300));
    ctx.fillStyle = 'rgba(56, 189, 248, 0.75)';

    for (let x = 0; x < columns; x += 1) {
      let min = 1;
      let max = -1;
      const start = x * block;
      const end = Math.min(buffer.length, start + block);
      for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
        const data = buffer.getChannelData(channel);
        for (let i = start; i < end; i += step) {
          const value = data[i];
          if (value < min) min = value;
          if (value > max) max = value;
        }
      }
      if (max < min) continue;
      const top = ((1 - max) / 2) * height;
      const bottom = ((1 - min) / 2) * height;
      ctx.fillRect(x, top, 1, Math.max(1, bottom - top));
    }

    ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.fillRect(0, height / 2, width, 1);

    const duration = buffer.duration || 1;
    const ratio = clamp(playheadRef.current / duration, 0, 1);
    const x = ratio * width;
    ctx.fillStyle = 'rgba(59, 130, 246, 0.95)';
    ctx.fillRect(x, 0, 2, height);
    ctx.beginPath();
    ctx.moveTo(x - 5, 0);
    ctx.lineTo(x + 5, 0);
    ctx.lineTo(x, 8);
    ctx.closePath();
    ctx.fill();
  }, []);

  useEffect(() => {
    previewRef.current = preview;
    if (!preview) return;
    const next = clamp(playheadRef.current, 0, preview.duration);
    playheadRef.current = next;
    setPlayhead(next);
    drawWaveform();
    updateTimeLabel();
  }, [preview, drawWaveform, updateTimeLabel]);

  useEffect(() => {
    playheadRef.current = playhead;
    if (!playing) {
      drawWaveform();
      updateTimeLabel();
    }
  }, [playhead, playing, drawWaveform, updateTimeLabel]);

  useEffect(() => {
    if (!base || !settings) return;
    let cancelled = false;
    stopPlayback();
    setProcessing(true);
    setError(null);
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const next = await renderEditedBuffer(base, settings);
          if (!cancelled) setPreview(next);
        } catch (failure) {
          if (!cancelled) setError(messageOf(failure));
        } finally {
          if (!cancelled) setProcessing(false);
        }
      })();
    }, 260);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [base, settings, stopPlayback, messageOf]);

  useEffect(() => () => stopPlayback(), [stopPlayback]);

  const startPlayback = useCallback(
    async (from: number) => {
      const buffer = previewRef.current;
      if (!buffer) return;
      let offset = clamp(from, 0, buffer.duration);
      if (offset >= buffer.duration - 0.01) offset = 0;
      stopPlayback();
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) {
        setError('Web Audio is not available in this browser.');
        return;
      }
      const ctx = new Ctor();
      try {
        await ctx.resume();
      } catch {
        void ctx.close().catch(() => undefined);
        setError('Your browser blocked audio playback. Press Play again.');
        return;
      }
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.onended = () => {
        if (sourceRef.current !== source) return;
        sourceRef.current = null;
        audioCtxRef.current = null;
        setPlaying(false);
        playheadRef.current = buffer.duration;
        setPlayhead(buffer.duration);
        drawWaveform();
        updateTimeLabel();
        void ctx.close().catch(() => undefined);
      };
      source.start(0, offset);
      sourceRef.current = source;
      audioCtxRef.current = ctx;
      startedAtRef.current = ctx.currentTime - offset;
      playheadRef.current = offset;
      setPlayhead(offset);
      setPlaying(true);
    },
    [drawWaveform, stopPlayback, updateTimeLabel],
  );

  useAnimationFrame(() => {
    const ctx = audioCtxRef.current;
    const buffer = previewRef.current;
    if (!ctx || !buffer) return;
    const position = ctx.currentTime - startedAtRef.current;
    if (position >= buffer.duration) {
      stopPlayback();
      playheadRef.current = buffer.duration;
      setPlayhead(buffer.duration);
      drawWaveform();
      updateTimeLabel();
      return;
    }
    playheadRef.current = position;
    drawWaveform();
    updateTimeLabel();
  }, playing);

  const togglePlay = () => {
    if (playing) {
      stopPlayback();
      setPlayhead(playheadRef.current);
      updateTimeLabel();
      return;
    }
    void startPlayback(playheadRef.current);
  };

  const seekTo = (seconds: number) => {
    if (processing) return;
    const duration = previewRef.current?.duration ?? 0;
    const value = clamp(seconds, 0, duration);
    playheadRef.current = value;
    setPlayhead(value);
    if (playing) void startPlayback(value);
    else {
      drawWaveform();
      updateTimeLabel();
    }
  };

  const seekFromEvent = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (processing) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width) return;
    const ratio = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    seekTo(ratio * (previewRef.current?.duration ?? 0));
  };

  const update = (patch: Partial<EditorSettings>) =>
    setSettings((previous) => (previous ? { ...previous, ...patch } : previous));

  const updateSpeed = (speed: number) =>
    setSettings((previous) =>
      previous ? { ...previous, speed, targetBpm: previous.sourceBpm * speed } : previous,
    );

  const updateTargetBpm = (bpm: number) =>
    setSettings((previous) => {
      if (!previous) return previous;
      const speed = clamp(bpm / previous.sourceBpm, 0.25, 4);
      return { ...previous, targetBpm: previous.sourceBpm * speed, speed };
    });

  const updateSourceBpm = (bpm: number) =>
    setSettings((previous) =>
      previous ? { ...previous, sourceBpm: bpm, targetBpm: bpm * previous.speed } : previous,
    );

  const pushHistory = () => {
    if (!base || !settings) return;
    setHistory((previous) => ({
      past: [...previous.past.slice(-(MAX_HISTORY - 1)), { buffer: base, settings }],
      future: [],
    }));
  };

  const undo = () => {
    if (!base || !settings || history.past.length === 0) return;
    const snapshot = history.past[history.past.length - 1];
    stopPlayback();
    setHistory({
      past: history.past.slice(0, -1),
      future: [{ buffer: base, settings }, ...history.future].slice(0, MAX_HISTORY),
    });
    setBase(snapshot.buffer);
    setSettings(snapshot.settings);
    setSplitFiles([]);
    setExportInfo(null);
    setPlayhead(0);
    playheadRef.current = 0;
  };

  const redo = () => {
    if (!base || !settings || history.future.length === 0) return;
    const snapshot = history.future[0];
    stopPlayback();
    setHistory({
      past: [...history.past, { buffer: base, settings }].slice(-MAX_HISTORY),
      future: history.future.slice(1),
    });
    setBase(snapshot.buffer);
    setSettings(snapshot.settings);
    setSplitFiles([]);
    setExportInfo(null);
    setPlayhead(0);
    playheadRef.current = 0;
  };

  const onFiles = (files: File[]) => {
    const picked = files[0];
    if (!picked) return;
    if (picked.size > MAX_AUDIO_BYTES) {
      toast.error(`"${picked.name}" is larger than the 100 MB editor limit.`);
      return;
    }
    stopPlayback();
    setPendingName(picked.name);
    setFile(null);
    setBase(null);
    setSettings(null);
    setPreview(null);
    setProcessing(true);
    setError(null);
    setSplitFiles([]);
    setExportInfo(null);
    setHistory({ past: [], future: [] });
    setPlayhead(0);
    playheadRef.current = 0;
    decodeTask.reset();
    void decodeTask.run(async () => {
      const buffer = await decodeAudio(picked);
      setFile(picked);
      setBase(buffer);
      setSettings(defaultEditorSettings(buffer.duration));
      setPendingName(null);
      setPlayhead(0);
      playheadRef.current = 0;
      return buffer;
    });
  };

  const handleCut = () => {
    if (!base || !settings) return;
    if (settings.trimEnd - settings.trimStart < 0.02) {
      toast.error('Choose a region of at least 0.02 seconds.');
      return;
    }
    let next: AudioBuffer;
    try {
      next = cutRegion(base, settings.trimStart, settings.trimEnd);
    } catch (failure) {
      toast.error(messageOf(failure));
      return;
    }
    pushHistory();
    setBase(next);
    setSettings({ ...settings, trimStart: 0, trimEnd: next.duration });
    setPlayhead(0);
    playheadRef.current = 0;
    setSplitFiles([]);
    setExportInfo(null);
    toast.success('Selection removed. Use Undo to get it back.');
  };

  const encodeOutput = async (buffer: AudioBuffer, suffix: string): Promise<OutputFile> => {
    if (!settings) throw new Error('Load an audio file first.');
    const blob =
      format === 'wav'
        ? encodeWav(buffer, { bitDepth: settings.bitDepth })
        : await encodeMp3(buffer, bitrate);
    return { name: `${baseName}${suffix}.${format}`, blob };
  };

  const handleExport = async () => {
    const buffer = previewRef.current;
    if (!buffer) return;
    setExporting(true);
    setError(null);
    try {
      const output = await encodeOutput(buffer, '-edited');
      downloadBlob(output.blob, output.name);
      setExportInfo({ name: output.name, size: output.blob.size });
      toast.success(`${output.name} is ready.`);
    } catch (failure) {
      setError(messageOf(failure));
    } finally {
      setExporting(false);
    }
  };

  const handleSplit = () => {
    const buffer = previewRef.current;
    if (!buffer || !settings) return;
    const at = playheadRef.current;
    if (at <= 0.02 || at >= buffer.duration - 0.02) {
      toast.error('Move the playhead inside the clip, away from the edges.');
      return;
    }
    setSplitting(true);
    setError(null);
    void (async () => {
      try {
        const [first, second] = splitBuffer(buffer, at);
        const files = await Promise.all([
          encodeOutput(first, '-part1'),
          encodeOutput(second, '-part2'),
        ]);
        setSplitFiles(files);
        toast.success('Split into two parts.');
      } catch (failure) {
        setError(messageOf(failure));
      } finally {
        setSplitting(false);
      }
    })();
  };

  const downloadSplitZip = async () => {
    if (!splitFiles.length) return;
    try {
      const blob = await zipFiles(
        splitFiles.map((entry) => ({ name: entry.name, data: entry.blob })),
      );
      downloadBlob(blob, `${baseName}-split.zip`);
    } catch (failure) {
      setError(messageOf(failure));
    }
  };

  const resetAll = () => {
    stopPlayback();
    decodeTask.reset();
    setFile(null);
    setPendingName(null);
    setBase(null);
    setSettings(null);
    setPreview(null);
    setProcessing(false);
    setPlaying(false);
    setPlayhead(0);
    playheadRef.current = 0;
    setHistory({ past: [], future: [] });
    setSplitFiles([]);
    setExportInfo(null);
    setError(null);
  };

  return (
    <ToolShell
      sidebar={
        settings ? (
          <div className="audio-sidebar-scroll">
            {advanced ? (
              <>
                <AudioSlider
                  label="Gain"
                  value={volumeToDb(settings.volume)}
                  min={-60}
                  max={24}
                  step={0.5}
                  onChange={(db) => update({ volume: dbToVolume(db), muted: false })}
                  onStart={pushHistory}
                  format={(value) => `${value.toFixed(1)} dB`}
                  hint="0 dB keeps the original level."
                />
                <AudioSlider
                  label="Speed"
                  value={settings.speed * 100}
                  min={25}
                  max={400}
                  step={1}
                  onChange={(value) => updateSpeed(value / 100)}
                  onStart={pushHistory}
                  format={(value) => `${value.toFixed(0)}%`}
                  hint="Exact speed without changing pitch."
                />
                <AudioSlider
                  label="Pitch"
                  value={settings.pitch}
                  min={-24}
                  max={24}
                  step={1}
                  onChange={(value) => update({ pitch: value })}
                  onStart={pushHistory}
                  format={(value) => `${value > 0 ? '+' : ''}${value.toFixed(0)} st`}
                  hint="Semitones, independent of speed."
                />
              </>
            ) : (
              <>
                <AudioSlider
                  label="Volume"
                  value={settings.volume}
                  min={0}
                  max={200}
                  step={1}
                  onChange={(value) => update({ volume: value })}
                  onStart={pushHistory}
                  format={(value) => `${value.toFixed(0)}%`}
                  hint="Quiet ← Volume → Loud"
                />
                <AudioSlider
                  label="Speed"
                  value={settings.speed * 100}
                  min={50}
                  max={200}
                  step={1}
                  onChange={(value) => updateSpeed(value / 100)}
                  onStart={pushHistory}
                  format={(value) => `${value.toFixed(0)}%`}
                  hint="Slower ← Speed → Faster"
                />
                <AudioSlider
                  label="Pitch"
                  value={settings.pitch}
                  min={-12}
                  max={12}
                  step={1}
                  onChange={(value) => update({ pitch: value })}
                  onStart={pushHistory}
                  format={(value) => `${value > 0 ? '+' : ''}${value.toFixed(0)} st`}
                  hint="Lower ← Pitch → Higher"
                />
              </>
            )}

            <AudioSlider
              label="Fade in"
              value={settings.fadeIn}
              min={0}
              max={fadeMax}
              step={0.05}
              onChange={(value) => update({ fadeIn: value })}
              onStart={pushHistory}
              format={(value) => `${value.toFixed(2)} s`}
            />
            <AudioSlider
              label="Fade out"
              value={settings.fadeOut}
              min={0}
              max={fadeMax}
              step={0.05}
              onChange={(value) => update({ fadeOut: value })}
              onStart={pushHistory}
              format={(value) => `${value.toFixed(2)} s`}
            />
            <SwitchRow
              label="Mute"
              hint="Silences the preview and the export."
              checked={settings.muted}
              onChange={(checked) => {
                pushHistory();
                update({ muted: checked });
              }}
            />

            {advanced && (
              <>
                <SectionTitle>Timing</SectionTitle>
                <Field label="Source BPM" hint="Tempo of the original clip.">
                  <NumberInput
                    value={settings.sourceBpm}
                    min={20}
                    max={300}
                    step={0.1}
                    suffix="BPM"
                    onFocus={pushHistory}
                    onChange={updateSourceBpm}
                  />
                </Field>
                <Field label="Target BPM" hint="Speed follows the target tempo.">
                  <NumberInput
                    value={Math.round(settings.targetBpm * 100) / 100}
                    min={20}
                    max={1200}
                    step={0.1}
                    suffix="BPM"
                    onFocus={pushHistory}
                    onChange={updateTargetBpm}
                  />
                </Field>

                <SectionTitle>Technical</SectionTitle>
                <Field label="Sample rate" hint="Source keeps the imported rate.">
                  <Select
                    value={String(settings.sampleRate)}
                    options={sampleRateOptions}
                    onChange={(event) => update({ sampleRate: Number(event.target.value) })}
                  />
                </Field>
                <Field label="Channels">
                  <Select
                    value={settings.channels}
                    options={[
                      { value: 'source', label: 'Keep source' },
                      { value: 'mono', label: 'Mono (1 channel)' },
                      { value: 'stereo', label: 'Stereo (2 channels)' },
                    ]}
                    onChange={(event) =>
                      update({ channels: event.target.value as EditorSettings['channels'] })
                    }
                  />
                </Field>
                <SwitchRow
                  label="Normalize peak"
                  hint="Raises the loudest peak to -1 dBFS."
                  checked={settings.normalize}
                  onChange={(checked) => {
                    pushHistory();
                    update({ normalize: checked });
                  }}
                />
                <SwitchRow
                  label="Compression"
                  hint="Evens out loud and quiet passages."
                  checked={settings.compression}
                  onChange={(checked) => {
                    pushHistory();
                    update({ compression: checked });
                  }}
                />
                {settings.compression && (
                  <>
                    <AudioSlider
                      label="Threshold"
                      value={settings.threshold}
                      min={-60}
                      max={0}
                      step={1}
                      onChange={(value) => update({ threshold: value })}
                      onStart={pushHistory}
                      format={(value) => `${value.toFixed(0)} dB`}
                    />
                    <AudioSlider
                      label="Ratio"
                      value={settings.ratio}
                      min={1}
                      max={20}
                      step={0.5}
                      onChange={(value) => update({ ratio: value })}
                      onStart={pushHistory}
                      format={(value) => `${value.toFixed(1)}:1`}
                    />
                  </>
                )}

                <SectionTitle>Equalizer</SectionTitle>
                <AudioSlider
                  label="Low"
                  value={settings.eqLow}
                  min={-18}
                  max={18}
                  step={0.5}
                  onChange={(value) => update({ eqLow: value })}
                  onStart={pushHistory}
                  format={(value) => `${value > 0 ? '+' : ''}${value.toFixed(1)} dB`}
                  hint="200 Hz low shelf."
                />
                <AudioSlider
                  label="Mid"
                  value={settings.eqMid}
                  min={-18}
                  max={18}
                  step={0.5}
                  onChange={(value) => update({ eqMid: value })}
                  onStart={pushHistory}
                  format={(value) => `${value > 0 ? '+' : ''}${value.toFixed(1)} dB`}
                  hint="1 kHz peaking band."
                />
                <AudioSlider
                  label="High"
                  value={settings.eqHigh}
                  min={-18}
                  max={18}
                  step={0.5}
                  onChange={(value) => update({ eqHigh: value })}
                  onStart={pushHistory}
                  format={(value) => `${value > 0 ? '+' : ''}${value.toFixed(1)} dB`}
                  hint="4 kHz high shelf."
                />
              </>
            )}

            <SectionTitle>Export</SectionTitle>
            <Field
              label="Format"
              hint={format === 'wav' ? 'Uncompressed PCM, lossless.' : 'Compressed, much smaller.'}
            >
              <Select
                value={format}
                options={[
                  { value: 'wav', label: 'WAV' },
                  { value: 'mp3', label: 'MP3' },
                ]}
                onChange={(event) => setFormat(event.target.value as OutputFormat)}
              />
            </Field>
            {format === 'mp3' &&
              (advanced ? (
                <Field label="Bitrate">
                  <Select
                    value={String(bitrate)}
                    options={[96, 128, 160, 192, 256, 320].map((value) => ({
                      value: String(value),
                      label: `${value} kbps`,
                    }))}
                    onChange={(event) => setBitrate(Number(event.target.value))}
                  />
                </Field>
              ) : (
                <Field label="Quality">
                  <Select
                    value={bitrate >= 320 ? '320' : '192'}
                    options={[
                      { value: '192', label: 'Standard — 192 kbps' },
                      { value: '320', label: 'High — 320 kbps' },
                    ]}
                    onChange={(event) => setBitrate(Number(event.target.value))}
                  />
                </Field>
              ))}
            {format === 'wav' && advanced && (
              <Field label="Bit depth" hint="24-bit keeps more headroom for further edits.">
                <Select
                  value={String(settings.bitDepth)}
                  options={[
                    { value: '16', label: '16-bit PCM' },
                    { value: '24', label: '24-bit PCM' },
                  ]}
                  onChange={(event) =>
                    update({ bitDepth: Number(event.target.value) === 24 ? 24 : 16 })
                  }
                />
              </Field>
            )}
          </div>
        ) : (
          <Notice tone="info">Load an audio clip to unlock the editing controls.</Notice>
        )
      }
      actions={
        <>
          <Button
            variant="ghost"
            icon={<RefreshCw />}
            onClick={resetAll}
            disabled={decodeTask.running}
          >
            Reset
          </Button>
          <Button
            variant="secondary"
            icon={playing ? <Pause /> : <Play />}
            onClick={togglePlay}
            disabled={!preview || processing}
          >
            {playing ? 'Pause' : 'Play'}
          </Button>
          <Button
            variant="primary"
            icon={<Download />}
            onClick={() => void handleExport()}
            loading={exporting}
            disabled={!preview || processing}
          >
            Export {format.toUpperCase()}
          </Button>
        </>
      }
      info={
        preview
          ? `${formatTime(preview.duration)} · ${preview.sampleRate} Hz · ${
              preview.numberOfChannels === 1 ? 'mono' : 'stereo'
            }`
          : undefined
      }
    >
      {!file || !base || !settings ? (
        <div className="stack">
          {decodeTask.running && (
            <Panel>
              <div className="row" style={{ gap: 14 }}>
                <Spinner />
                <div>
                  <div className="strong">Reading audio…</div>
                  <div className="dim tiny">
                    {pendingName ?? 'Decoding in your browser'}
                  </div>
                </div>
              </div>
            </Panel>
          )}
          {decodeTask.error && (
            <Notice tone="error" title="Could not open this audio">
              {decodeTask.error} Try a WAV, MP3, OGG, M4A or FLAC file.
            </Notice>
          )}
          <DropZone
            onFiles={onFiles}
            accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac,.webm"
            multiple={false}
            size="lg"
            icon={<Music />}
            title="Drop an audio clip here"
            hint={
              advanced
                ? 'Precise trimming, BPM, EQ, compression and technical export controls'
                : 'Trim, cut, change speed and pitch, then export your clip'
            }
            formats={['MP3', 'WAV', 'OGG', 'M4A', 'AAC', 'FLAC']}
            disabled={decodeTask.running}
          />
          <Panel title="How it works">
            <ol className="stack-sm" style={{ margin: 0, paddingLeft: 18 }}>
              <li>Upload or drop one audio file. It is decoded in this tab and never uploaded.</li>
              <li>Click or drag the waveform to move the playhead. Use the trim controls to choose a region.</li>
              <li>Cut removes a region, Split exports two clips at the playhead, and every control updates the preview.</li>
              <li>Export as MP3 or WAV when the preview sounds right.</li>
            </ol>
          </Panel>
          {error && <Notice tone="error">{error}</Notice>}
          <Notice tone="info">
            Files up to 100 MB. Longer clips take a little more time to re-render after each
            change.
          </Notice>
        </div>
      ) : (
        <div className="stack">
          {error && (
            <Notice tone="error" title="The last change could not be rendered">
              {error}
            </Notice>
          )}

          <Panel
            title={advanced ? 'Waveform & transport' : 'Waveform'}
            actions={
              <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                <Badge tone="neutral">{formatTime(base.duration, true)} source</Badge>
                {settings.muted && <Badge tone="warning">Muted</Badge>}
                {(processing || !preview) && <Badge tone="info">Rendering…</Badge>}
              </div>
            }
          >
            <div
              style={{
                position: 'relative',
                overflow: 'hidden',
                borderRadius: 8,
                background: 'rgba(15, 23, 42, 0.35)',
              }}
            >
              <canvas
                ref={canvasRef}
                width={1200}
                height={180}
                style={{
                  display: 'block',
                  width: '100%',
                  height: 180,
                  cursor: processing ? 'wait' : 'crosshair',
                  touchAction: 'none',
                }}
                onPointerDown={(event) => {
                  if (processing) return;
                  event.currentTarget.setPointerCapture(event.pointerId);
                  seekFromEvent(event);
                }}
                onPointerMove={(event) => {
                  if (processing || event.buttons !== 1) return;
                  seekFromEvent(event);
                }}
                tabIndex={0}
                role="slider"
                aria-label="Waveform timeline. Use arrow keys to move the playhead."
                aria-valuemin={0}
                aria-valuemax={preview?.duration ?? 0}
                aria-valuenow={playhead}
                aria-valuetext={`${formatTime(playhead, true)} of ${formatTime(preview?.duration ?? 0, true)}`}
                onKeyDown={(event) => {
                  if (processing) return;
                  const step = event.shiftKey ? 1 : 0.1;
                  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                    event.preventDefault();
                    seekTo(playheadRef.current + (event.key === 'ArrowRight' ? step : -step));
                  } else if (event.key === 'Home' || event.key === 'End') {
                    event.preventDefault();
                    seekTo(event.key === 'Home' ? 0 : previewRef.current?.duration ?? 0);
                  } else if (event.key === ' ') {
                    event.preventDefault();
                    togglePlay();
                  }
                }}
              />
              {(processing || !preview) && <BusyOverlay message="Rendering your edit…" />}            </div>
            <div
              className="row spread"
              style={{ marginTop: 12, gap: 12, flexWrap: 'wrap' }}
            >
              <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
                <Button
                  variant="primary"
                  icon={playing ? <Pause /> : <Play />}
                  onClick={togglePlay}
                  disabled={processing || !preview}
                >
                  {playing ? 'Pause' : 'Play'}
                </Button>
                <span className="mono tiny" ref={timeTextRef} style={{ minWidth: 132 }}>
                  {formatTime(playhead, true)} / {formatTime(preview?.duration ?? 0, true)}
                </span>
              </div>
              <div className="row" style={{ gap: 6 }}>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Undo2 />}
                  onClick={undo}
                  disabled={history.past.length === 0}
                >
                  Undo
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Redo2 />}
                  onClick={redo}
                  disabled={history.future.length === 0}
                >
                  Redo
                </Button>
              </div>
            </div>
            <div className="field-hint" style={{ marginTop: 6 }}>
              Click or drag on the waveform to place the playhead. Preview always plays the edited
              result.
            </div>
          </Panel>

          <Panel
            title="Trim & cut"
            actions={
              <span className="dim tiny">
                Selection {formatTime(Math.max(0, settings.trimEnd - settings.trimStart), true)} of{' '}
                {formatTime(base.duration, true)}
              </span>
            }
          >
            <div className="stack">
              <AudioSlider
                label="Start"
                value={settings.trimStart}
                min={0}
                max={Math.max(0, settings.trimEnd - 0.01)}
                step={0.01}
                onChange={(value) =>
                  update({ trimStart: clamp(value, 0, settings.trimEnd - 0.01) })
                }
                onStart={pushHistory}
                format={(value) => formatTime(value, true)}
              />
              <AudioSlider
                label="End"
                value={settings.trimEnd}
                min={Math.min(base.duration, settings.trimStart + 0.01)}
                max={base.duration}
                step={0.01}
                onChange={(value) =>
                  update({ trimEnd: clamp(value, settings.trimStart + 0.01, base.duration) })
                }
                onStart={pushHistory}
                format={(value) => formatTime(value, true)}
              />
              {advanced && (
                <div className="grid-2">
                  <Field label="Exact start (seconds)">
                    <NumberInput
                      value={Number(settings.trimStart.toFixed(3))}
                      min={0}
                      max={Math.max(0, settings.trimEnd - 0.01)}
                      step={0.001}
                      suffix="s"
                      onFocus={pushHistory}
                      onChange={(value) => {
                        if (!Number.isFinite(value)) return;
                        update({ trimStart: clamp(value, 0, settings.trimEnd - 0.01) });
                      }}
                    />
                  </Field>
                  <Field label="Exact end (seconds)">
                    <NumberInput
                      value={Number(settings.trimEnd.toFixed(3))}
                      min={Math.min(base.duration, settings.trimStart + 0.01)}
                      max={base.duration}
                      step={0.001}
                      suffix="s"
                      onFocus={pushHistory}
                      onChange={(value) => {
                        if (!Number.isFinite(value)) return;
                        update({ trimEnd: clamp(value, settings.trimStart + 0.01, base.duration) });
                      }}
                    />
                  </Field>
                </div>
              )}
              <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
                <Button
                  variant="outline"
                  icon={<Scissors />}
                  onClick={handleCut}
                  disabled={
                    processing || settings.trimEnd - settings.trimStart < 0.02
                  }
                >
                  Cut selection
                </Button>
                <Button
                  variant="outline"
                  icon={<Slice />}
                  onClick={handleSplit}
                  loading={splitting}
                  disabled={processing || !preview}
                >
                  Split at playhead
                </Button>
              </div>
              <div className="field-hint">
                Cut removes the selected region from the working clip. Split exports the current
                result as two clips at the playhead. Undo restores earlier edits.
              </div>
            </div>
          </Panel>

          <Panel title="Export">
            <div className="row spread" style={{ gap: 12, flexWrap: 'wrap' }}>
              <div className="stack-sm grow" style={{ minWidth: 200 }}>
                <div className="strong">
                  {format.toUpperCase()}{' '}
                  {format === 'wav'
                    ? `${settings.bitDepth}-bit ${
                        settings.sampleRate === 0 ? base.sampleRate : settings.sampleRate
                      } Hz`
                    : `${bitrate} kbps`}
                </div>
                <div className="dim tiny">
                  {formatTime(preview?.duration ?? 0, true)} ·{' '}
                  {settings.channels === 'source'
                    ? base.numberOfChannels === 1
                      ? 'mono'
                      : 'stereo'
                    : settings.channels}
                </div>
              </div>
              <Button
                variant="primary"
                icon={<Download />}
                onClick={() => void handleExport()}
                loading={exporting}
                disabled={processing || !preview}
              >
                Export {format.toUpperCase()}
              </Button>
            </div>
            {exportInfo && (
              <div className="grid-2" style={{ marginTop: 12 }}>
                <Stat label="File" value={exportInfo.name} />
                <Stat label="Size" value={formatBytes(exportInfo.size)} />
              </div>
            )}
          </Panel>

          {splitFiles.length > 0 && (
            <Panel
              title="Split result"
              actions={
                <Button
                  size="sm"
                  variant="outline"
                  icon={<Download />}
                  onClick={() => void downloadSplitZip()}
                >
                  Download both (ZIP)
                </Button>
              }
            >
              <div className="stack-sm">
                {splitFiles.map((entry) => (
                  <div
                    key={entry.name}
                    className="spread"
                    style={{ gap: 12, flexWrap: 'wrap' }}
                  >
                    <span
                      className="mono tiny"
                      style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}
                    >
                      {entry.name}
                    </span>
                    <div className="row" style={{ gap: 8 }}>
                      <span className="dim tiny">{formatBytes(entry.blob.size)}</span>
                      <Button
                        size="sm"
                        variant="outline"
                        icon={<Download />}
                        onClick={() => downloadBlob(entry.blob, entry.name)}
                      >
                        Download
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          )}

          <Notice tone="info">
            Everything is processed locally. The preview plays the edited result; export writes it
            as a new file and leaves your original untouched.
            {!advanced &&
              ' Need BPM, EQ, compression, exact gain or sample-rate control? Use Advanced Audio Editor.'}
          </Notice>
        </div>
      )}
    </ToolShell>
  );
}

import { useEffect, useRef, useState } from 'react';
import { AudioLines, RefreshCw } from 'lucide-react';
import { ToolShell } from '../../../components/ToolShell';
import {
  Button,
  Notice,
  Panel,
  Segmented,
  Stat,
} from '../../../components/ui';
import { DropZone } from '../../../components/files';
import { useTask } from '../../../core/hooks';
import { formatDuration, formatNumber } from '../../../core/format';
import { decodeAudio, peakOf, rmsOf, toDb } from '../audio';

interface Analysis {
  duration: number;
  sampleRate: number;
  channels: number;
  peak: number;
  rms: number;
  silence: number;
  dc: number;
}

export default function WaveformViewer() {
  const [file, setFile] = useState<File | null>(null);
  const [channel, setChannel] = useState(0);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const task = useTask<Analysis>();

  const draw = (channelIndex: number) => {
    const buffer = bufferRef.current;
    const canvas = canvasRef.current;
    if (!buffer || !canvas) return;
    const columns = 1200;
    canvas.width = columns;
    canvas.height = 260;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(56,189,248,0.85)';

    const data = buffer.getChannelData(Math.min(channelIndex, buffer.numberOfChannels - 1));
    const block = Math.max(1, Math.floor(data.length / columns));
    const step = Math.max(1, Math.floor(block / 4000));

    for (let x = 0; x < columns; x += 1) {
      const start = x * block;
      const end = Math.min(data.length, start + block);
      let min = 1;
      let max = -1;
      for (let i = start; i < end; i += step) {
        const v = data[i];
        if (v < min) min = v;
        if (v > max) max = v;
      }
      if (max < min) continue;
      const top = ((1 - max) / 2) * canvas.height;
      const bottom = ((1 - min) / 2) * canvas.height;
      ctx.fillRect(x, top, 1, Math.max(1, bottom - top));
    }

    // Zero line
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(0, canvas.height / 2, canvas.width, 1);
  };

  useEffect(() => {
    draw(channel);
  }, [channel]);

  const onFiles = async (files: File[]) => {
    const f = files[0];
    if (!f) return;
    setFile(f);
    setAnalysis(null);
    bufferRef.current = null;
    await task.run(async () => {
      const buffer = await decodeAudio(f);
      bufferRef.current = buffer;
      let silence = 0;
      let total = 0;
      let dcSum = 0;
      const step = Math.max(1, Math.floor(buffer.length / 300000));
      for (let c = 0; c < buffer.numberOfChannels; c += 1) {
        const data = buffer.getChannelData(c);
        for (let i = 0; i < data.length; i += step) {
          if (Math.abs(data[i]) < 0.001) silence += 1;
          dcSum += data[i];
          total += 1;
        }
      }
      const value: Analysis = {
        duration: buffer.duration,
        sampleRate: buffer.sampleRate,
        channels: buffer.numberOfChannels,
        peak: peakOf(buffer),
        rms: rmsOf(buffer),
        silence: total ? silence / total : 0,
        dc: total ? dcSum / total : 0,
      };
      setAnalysis(value);
      setChannel(0);
      window.setTimeout(() => draw(0), 0);
      return value;
    });
  };

  const reset = () => {
    setFile(null);
    setAnalysis(null);
    bufferRef.current = null;
    setChannel(0);
    task.reset();
  };

  return (
    <ToolShell
      sidebar={
        <>
          {analysis && analysis.channels > 1 && (
            <Segmented
              options={Array.from({ length: Math.min(analysis.channels, 6) }, (_, i) => ({
                value: String(i),
                label: `Ch ${i + 1}`,
              }))}
              value={String(channel)}
              onChange={(v) => setChannel(Number(v))}
            />
          )}
          <Notice tone="info">
            The waveform shows min/max peaks per pixel column. Silence is the share of samples below
            0.001 absolute value across all channels.
          </Notice>
        </>
      }
      actions={
        <Button variant="ghost" icon={<RefreshCw />} onClick={reset}>
          Reset
        </Button>
      }
      info={analysis ? formatDuration(analysis.duration) : undefined}
    >
      {!file ? (
        <DropZone
          onFiles={(files) => void onFiles(files)}
          accept="audio/*,.mp3,.wav,.ogg,.m4a,.flac"
          formats={['MP3', 'WAV', 'OGG', 'M4A']}
          size="lg"
          multiple={false}
          icon={<AudioLines />}
          title="Drop an audio file to inspect"
        />
      ) : (
        <Panel title={file.name}>
          {task.running && <div className="dim tiny">Decoding…</div>}
          {task.error && (
            <Notice tone="error" title="Could not decode">
              {task.error}
            </Notice>
          )}
          <div className="stage" style={{ padding: 12 }}>
            <canvas ref={canvasRef} style={{ width: '100%', height: 260, display: 'block' }} />
          </div>
        </Panel>
      )}

      {analysis && (
        <div className="grid-4">
          <Stat label="Duration" value={formatDuration(analysis.duration)} />
          <Stat label="Sample rate" value={`${formatNumber(analysis.sampleRate)} Hz`} />
          <Stat label="Peak" value={`${toDb(analysis.peak).toFixed(1)} dBFS`} tone={analysis.peak >= 1 ? 'bad' : analysis.peak > 0.98 ? 'warn' : 'ok'} />
          <Stat label="RMS" value={`${toDb(analysis.rms).toFixed(1)} dBFS`} />
          <Stat label="Silence" value={`${(analysis.silence * 100).toFixed(1)}%`} />
          <Stat label="DC offset" value={analysis.dc.toFixed(5)} tone={Math.abs(analysis.dc) > 0.01 ? 'warn' : 'neutral'} />
          <Stat label="Channels" value={String(analysis.channels)} />
          <Stat label="Clipping" value={analysis.peak >= 1 ? 'Yes' : 'No'} tone={analysis.peak >= 1 ? 'warn' : 'ok'} />
        </div>
      )}
    </ToolShell>
  );
}

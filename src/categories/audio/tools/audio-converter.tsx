import { useRef, useState } from 'react';
import { Download, Music, RefreshCw } from 'lucide-react';
import { ToolShell } from '../../../components/ToolShell';
import {
  Button,
  CheckBox,
  Field,
  Notice,
  Panel,
  Segmented,
  Select,
  Stat,
  useToast,
} from '../../../components/ui';
import { DropZone } from '../../../components/files';
import { useTask } from '../../../core/hooks';
import { downloadBlob } from '../../../core/files';
import { formatBytes, formatNumber, stripExt } from '../../../core/format';
import { UserError } from '../../../core/errors';
import { decodeAudio, encodeMp3, encodeWav } from '../audio';

type Format = 'wav' | 'mp3';

interface Meta {
  duration: number;
  sampleRate: number;
  channels: number;
  name: string;
}

export default function AudioConverter() {
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [format, setFormat] = useState<Format>('wav');
  const [bitrate, setBitrate] = useState('192');
  const [mono, setMono] = useState(false);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const decodeTask = useTask<Meta>();
  const convertTask = useTask<{ blob: Blob; name: string }>();

  const onFiles = async (files: File[]) => {
    const f = files[0];
    if (!f) return;
    setFile(f);
    setMeta(null);
    bufferRef.current = null;
    convertTask.reset();
    await decodeTask.run(async () => {
      const buffer = await decodeAudio(f);
      bufferRef.current = buffer;
      const value: Meta = {
        duration: buffer.duration,
        sampleRate: buffer.sampleRate,
        channels: buffer.numberOfChannels,
        name: f.name,
      };
      setMeta(value);
      return value;
    });
  };

  const convert = () =>
    convertTask.run(async () => {
      const buffer = bufferRef.current;
      if (!buffer || !file) throw new UserError('Add an audio file first.');
      const base = stripExt(file.name);
      if (format === 'mp3') {
        const blob = await encodeMp3(buffer, Number(bitrate), mono);
        return { blob, name: `${base}.mp3` };
      }
      return { blob: encodeWav(buffer, mono), name: `${base}.wav` };
    });

  const reset = () => {
    setFile(null);
    setMeta(null);
    bufferRef.current = null;
    setFormat('wav');
    setBitrate('192');
    setMono(false);
    decodeTask.reset();
    convertTask.reset();
  };

  return (
    <ToolShell
      sidebar={
        <>
          <Field label="Output format">
            <Segmented
              options={[
                { value: 'wav', label: 'WAV (16-bit PCM)' },
                { value: 'mp3', label: 'MP3 (lossy)' },
              ]}
              value={format}
              onChange={(v) => {
                setFormat(v);
                convertTask.reset();
              }}
            />
          </Field>
          {format === 'mp3' && (
            <Field label="Bitrate" hint="Higher bitrate means larger files and fewer artefacts.">
              <Select
                value={bitrate}
                onChange={(e) => setBitrate(e.target.value)}
                options={['96', '128', '160', '192', '256', '320'].map((b) => ({
                  value: b,
                  label: `${b} kbps`,
                }))}
              />
            </Field>
          )}
          <CheckBox
            checked={mono}
            onChange={setMono}
            label="Downmix to mono"
            hint="Averages all channels — useful for SFX."
          />
          <Notice tone="warning" title="MP3 is lossy">
            MP3 discards information permanently at the chosen bitrate; WAV is uncompressed 16-bit
            PCM. Sample-rate conversion is not performed — output keeps the source rate.
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
            loading={convertTask.running}
            disabled={!bufferRef.current || decodeTask.running}
            onClick={convert}
          >
            Convert
          </Button>
          <Button
            variant="success"
            icon={<Download />}
            disabled={!convertTask.result}
            onClick={() => {
              if (!convertTask.result) return;
              downloadBlob(convertTask.result.blob, convertTask.result.name);
              toast.success('Downloaded.');
            }}
          >
            Download
          </Button>
        </>
      }
      info={meta ? `${meta.duration.toFixed(2)} s · ${formatNumber(meta.sampleRate)} Hz` : undefined}
    >
      {!file ? (
        <DropZone
          onFiles={(files) => void onFiles(files)}
          accept="audio/*,.mp3,.wav,.ogg,.m4a,.flac,.aac"
          formats={['MP3', 'WAV', 'OGG', 'M4A', 'FLAC']}
          size="lg"
          multiple={false}
          icon={<Music />}
          title="Drop an audio file"
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
              <Stat label="Duration" value={`${meta.duration.toFixed(2)} s`} />
              <Stat label="Sample rate" value={`${formatNumber(meta.sampleRate)} Hz`} />
              <Stat label="Channels" value={String(meta.channels)} />
              <Stat label="Source size" value={formatBytes(file.size)} />
            </div>
          )}
        </Panel>
      )}
      {convertTask.error && (
        <Notice tone="error" title="Could not convert">
          {convertTask.error}
        </Notice>
      )}
      {convertTask.result && (
        <div className="grid-3">
          <Stat label="Format" value={format.toUpperCase()} />
          <Stat label="Output" value={formatBytes(convertTask.result.blob.size)} />
          <Stat label="Channels" value={mono ? 'Mono' : meta ? `${meta.channels}` : '—'} />
        </div>
      )}
    </ToolShell>
  );
}

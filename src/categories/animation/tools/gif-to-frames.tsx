import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { ToolShell } from '../../../components/ToolShell';
import {
  Button,
  Field,
  Notice,
  NumberInput,
  Panel,
  ProgressBar,
  Stat,
  useToast,
} from '../../../components/ui';
import { DropZone } from '../../../components/files';
import { useTask } from '../../../core/hooks';
import { canvasToBlob, imageDataToCanvas } from '../../../core/image';
import { downloadBlob, zipFiles } from '../../../core/files';
import { formatBytes, formatNumber, padIndex, stripExt } from '../../../core/format';
import { decodeGif } from '../gif';

interface Result {
  count: number;
  total: number;
}

export default function GifToFrames() {
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [step, setStep] = useState(1);
  const [meta, setMeta] = useState<{ width: number; height: number; frames: number } | null>(null);
  const [gifData, setGifData] = useState<Awaited<ReturnType<typeof decodeGif>> | null>(null);
  const decodeTask = useTask<{ width: number; height: number; frames: number }>();
  const exportTask = useTask<Result>();

  const onFiles = async (files: File[]) => {
    const f = files[0];
    if (!f) return;
    setFile(f);
    setMeta(null);
    setGifData(null);
    exportTask.reset();
    await decodeTask.run(async () => {
      const gif = await decodeGif(f);
      setGifData(gif);
      const value = { width: gif.width, height: gif.height, frames: gif.frames.length };
      setMeta(value);
      return value;
    });
  };

  const exportFrames = () =>
    exportTask.run(async (report) => {
      if (!gifData || !file) throw new Error('Add a GIF first.');
      const base = stripExt(file.name);
      const selected = gifData.frames.filter((_, i) => i % Math.max(1, step) === 0);
      const entries: Array<{ name: string; data: Blob }> = [];
      for (let i = 0; i < selected.length; i += 1) {
        report(i / selected.length, `Encoding frame ${i + 1}/${selected.length}`);
        const blob = await canvasToBlob(imageDataToCanvas(selected[i].image), 'image/png');
        entries.push({
          name: `${base}_frame_${padIndex(i, selected.length)}.png`,
          data: blob,
        });
      }
      report(0.95, 'Packing ZIP');
      const zip = await zipFiles(entries);
      downloadBlob(zip, `${base}-frames.zip`);
      toast.success(`Exported ${formatNumber(entries.length)} frames.`);
      return { count: entries.length, total: entries.reduce((sum, e) => sum + e.data.size, 0) };
    });

  const reset = () => {
    setFile(null);
    setMeta(null);
    setGifData(null);
    setStep(1);
    decodeTask.reset();
    exportTask.reset();
  };

  return (
    <ToolShell
      sidebar={
        <>
          <Field label="Frame step" hint="1 exports every frame; 2 exports every second frame.">
            <NumberInput value={step} min={1} max={60} onChange={setStep} />
          </Field>
          <Notice tone="info">
            Frames are composited exactly as the GIF displays them (disposal methods respected), then
            written as PNG with transparency preserved.
          </Notice>
        </>
      }
      actions={
        <>
          <Button variant="ghost" icon={<RefreshCw />} onClick={reset}>
            Reset
          </Button>
          <Button variant="primary" loading={exportTask.running} disabled={!gifData} onClick={exportFrames}>
            Export PNG frames
          </Button>
        </>
      }
      info={meta ? `${meta.width} × ${meta.height} · ${formatNumber(meta.frames)} frames` : undefined}
    >
      {!file ? (
        <DropZone
          onFiles={(files) => void onFiles(files)}
          accept="image/gif,.gif"
          formats={['GIF']}
          size="lg"
          multiple={false}
          title="Drop a GIF to extract frames"
        />
      ) : (
        <Panel title={file.name}>
          {decodeTask.running && <div className="dim tiny">Decoding frames…</div>}
          {decodeTask.error && (
            <Notice tone="error" title="Could not decode">
              {decodeTask.error}
            </Notice>
          )}
          {meta && (
            <div className="grid-3">
              <Stat label="Dimensions" value={`${meta.width} × ${meta.height}`} />
              <Stat label="Frames" value={formatNumber(meta.frames)} />
              <Stat label="Exporting" value={formatNumber(Math.ceil(meta.frames / Math.max(1, step)))} />
            </div>
          )}
        </Panel>
      )}
      {exportTask.running && (
        <Panel title="Progress">
          <ProgressBar value={exportTask.progress} label={exportTask.message} />
        </Panel>
      )}
      {exportTask.error && (
        <Notice tone="error" title="Could not export">
          {exportTask.error}
        </Notice>
      )}
      {exportTask.result && (
        <div className="grid-2">
          <Stat label="Frames" value={formatNumber(exportTask.result.count)} />
          <Stat label="ZIP size" value={formatBytes(exportTask.result.total)} />
        </div>
      )}
    </ToolShell>
  );
}

import { useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { ToolShell } from '../../../components/ToolShell';
import {
  Button,
  Field,
  Notice,
  NumberInput,
  Panel,
  Stat,
  TextInput,
  useToast,
} from '../../../components/ui';
import { DropZone, FileGrid, QueueHeader, useFileQueue } from '../../../components/files';
import { useTask } from '../../../core/hooks';
import { downloadBlob, zipFiles } from '../../../core/files';
import { extname, formatBytes, formatNumber, sortByName } from '../../../core/format';
import { UserError } from '../../../core/errors';

export default function ImageSequenceOrganizer() {
  const toast = useToast();
  const queue = useFileQueue({ accept: 'image/*', maxFiles: 500 });
  const [prefix, setPrefix] = useState('frame_');
  const [start, setStart] = useState(0);
  const [digits, setDigits] = useState(3);
  const task = useTask<{ count: number; total: number }>();

  const sorted = useMemo(() => sortByName(queue.items, (item) => item.file.name), [queue.items]);

  const mapping = useMemo(
    () =>
      sorted.map((item, index) => {
        const ext = extname(item.file.name) || 'png';
        const number = String(start + index).padStart(Math.max(1, digits), '0');
        return { item, from: item.file.name, to: `${prefix}${number}.${ext}` };
      }),
    [sorted, prefix, start, digits],
  );

  const run = () =>
    task.run(async (report) => {
      if (!mapping.length) throw new UserError('Add at least one image first.');
      const entries = mapping.map(({ item, to }) => ({ name: to, data: item.file }));
      report(0.5, 'Packing ZIP');
      const zip = await zipFiles(entries);
      downloadBlob(zip, 'renamed-sequence.zip');
      toast.success(`Exported ${formatNumber(entries.length)} renamed files.`);
      return { count: entries.length, total: zip.size };
    });

  const reset = () => {
    queue.clear();
    setPrefix('frame_');
    setStart(0);
    setDigits(3);
    task.reset();
  };

  return (
    <ToolShell
      sidebar={
        <>
          <Field label="Prefix">
            <TextInput value={prefix} onChange={(e) => setPrefix(e.target.value)} className="mono" />
          </Field>
          <Field label="Start number">
            <NumberInput value={start} min={0} max={99999} onChange={setStart} />
          </Field>
          <Field label="Digits" hint="Zero-padding keeps files sorted in engines and file browsers.">
            <NumberInput value={digits} min={1} max={8} onChange={setDigits} />
          </Field>
          <Notice tone="info">
            Files are sorted naturally by filename first (frame_2 comes before frame_10). Renaming
            happens in the exported ZIP only — your original files are untouched.
          </Notice>
        </>
      }
      actions={
        <>
          <Button variant="ghost" icon={<RefreshCw />} onClick={reset}>
            Reset
          </Button>
          <Button variant="primary" loading={task.running} disabled={!mapping.length} onClick={run}>
            Export renamed ZIP
          </Button>
        </>
      }
      info={mapping.length ? `${formatNumber(mapping.length)} files` : undefined}
    >
      {queue.items.length === 0 ? (
        <DropZone
          onFiles={(files) => queue.add(files)}
          accept="image/*"
          formats={['PNG', 'JPG', 'WebP']}
          size="lg"
          title="Drop an image sequence"
        />
      ) : (
        <Panel title="Sequence" actions={<QueueHeader count={queue.items.length} onClear={queue.clear} />}>
          <FileGrid items={queue.items} onRemove={queue.remove} />
        </Panel>
      )}

      {task.error && (
        <Notice tone="error" title="Could not export">
          {task.error}
        </Notice>
      )}

      {mapping.length > 0 && (
        <>
          <div className="grid-3">
            <Stat label="Files" value={formatNumber(mapping.length)} />
            <Stat label="Total size" value={formatBytes(mapping.reduce((sum, m) => sum + m.item.file.size, 0))} />
            <Stat label="ZIP" value={task.result ? formatBytes(task.result.total) : '—'} />
          </div>
          <Panel title="Rename map" flush>
            <div style={{ maxHeight: 360, overflow: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Original</th>
                    <th>New name</th>
                  </tr>
                </thead>
                <tbody>
                  {mapping.map((m) => (
                    <tr key={m.item.id}>
                      <td className="mono tiny">{m.from}</td>
                      <td className="mono tiny">{m.to}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}
    </ToolShell>
  );
}

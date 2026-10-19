import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { ToolShell, MetaGrid } from '../../../components/ToolShell';
import { Button, Notice, Panel, Stat } from '../../../components/ui';
import { DropZone, FileRow, QueueHeader, useFileQueue } from '../../../components/files';
import { useTask } from '../../../core/hooks';
import { analyseAlpha, loadImage } from '../../../core/image';
import { formatBytes, formatNumber, isPowerOfTwo } from '../../../core/format';

interface Metadata {
  name: string;
  type: string;
  size: number;
  width: number;
  height: number;
  hasAlpha: boolean;
  alphaCoverage: number;
  pot: boolean;
  megapixels: number;
}

export default function ImageMetadata() {
  const queue = useFileQueue({ accept: 'image/*' });
  const [selected, setSelected] = useState<Metadata | null>(null);
  const task = useTask<Metadata[]>();

  const run = () =>
    task.run(async (report) => {
      if (!queue.items.length) throw new Error('Add at least one image first.');
      const results: Metadata[] = [];
      for (let i = 0; i < queue.items.length; i += 1) {
        const item = queue.items[i];
        report(i / queue.items.length, `Reading ${item.file.name}`);
        const image = await loadImage(item.file);
        try {
          const canvas = document.createElement('canvas');
          canvas.width = image.width;
          canvas.height = image.height;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          let hasAlpha = false;
          let alphaCoverage = 0;
          if (ctx) {
            ctx.drawImage(image.source, 0, 0);
            const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const alpha = analyseAlpha(data);
            hasAlpha = alpha.hasAlpha;
            alphaCoverage = alpha.transparentRatio;
          }
          results.push({
            name: item.file.name,
            type: item.file.type || 'unknown',
            size: item.file.size,
            width: image.width,
            height: image.height,
            hasAlpha,
            alphaCoverage,
            pot: isPowerOfTwo(image.width) && isPowerOfTwo(image.height),
            megapixels: (image.width * image.height) / 1_000_000,
          });
        } finally {
          image.dispose();
        }
      }
      report(1, 'Done');
      return results;
    });

  const reset = () => {
    task.reset();
    queue.clear();
    setSelected(null);
  };

  return (
    <ToolShell
      actions={
        <>
          <Button variant="ghost" icon={<RefreshCw />} onClick={reset}>
            Reset
          </Button>
          <Button variant="primary" loading={task.running} disabled={!queue.items.length} onClick={run}>
            Inspect {queue.items.length || ''}
          </Button>
        </>
      }
    >
      {queue.items.length === 0 ? (
        <DropZone
          onFiles={(files) => queue.add(files)}
          accept="image/*"
          formats={['PNG', 'JPG', 'WebP', 'BMP', 'GIF']}
          size="lg"
        />
      ) : (
        <Panel title="Files" actions={<QueueHeader count={queue.items.length} onClear={queue.clear} />}>
          <div className="stack-sm">
            {queue.items.map((item) => (
              <FileRow key={item.id} item={item} onRemove={queue.remove} />
            ))}
          </div>
        </Panel>
      )}

      {task.error && (
        <Notice tone="error" title="Could not inspect">
          {task.error}
        </Notice>
      )}

      {task.result && task.result.length > 0 && (
        <>
          <div className="grid-4">
            <Stat label="Files" value={formatNumber(task.result.length)} />
            <Stat
              label="Total size"
              value={formatBytes(task.result.reduce((s, m) => s + m.size, 0))}
            />
            <Stat
              label="Non-POT"
              value={formatNumber(task.result.filter((m) => !m.pot).length)}
              tone={task.result.some((m) => !m.pot) ? 'warn' : 'ok'}
            />
            <Stat
              label="With alpha"
              value={formatNumber(task.result.filter((m) => m.hasAlpha).length)}
            />
          </div>
          <Panel title="Select a file to inspect">
            <div className="stack-sm">
              {task.result.map((m) => (
                <button
                  key={m.name}
                  type="button"
                  className="row spread"
                  style={{
                    background: selected?.name === m.name ? 'var(--accent-soft)' : 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '6px 8px',
                    borderRadius: 'var(--r-xs)',
                    color: 'var(--text-0)',
                    fontSize: 'var(--fs-sm)',
                  }}
                  onClick={() => setSelected(m)}
                >
                  <span className="truncate" style={{ maxWidth: 240 }}>{m.name}</span>
                  <span className="dim mono tiny">
                    {m.width}×{m.height} · {formatBytes(m.size)}
                  </span>
                </button>
              ))}
            </div>
          </Panel>
          {selected && (
            <Panel title={selected.name}>
              <MetaGrid
                rows={[
                  { label: 'File name', value: selected.name },
                  { label: 'MIME type', value: selected.type },
                  { label: 'File size', value: formatBytes(selected.size) },
                  { label: 'Dimensions', value: `${selected.width} × ${selected.height} px` },
                  { label: 'Megapixels', value: `${selected.megapixels.toFixed(2)} MP` },
                  { label: 'Power of two', value: selected.pot ? 'Yes' : 'No' },
                  {
                    label: 'Has transparency',
                    value: selected.hasAlpha
                      ? `Yes (${(selected.alphaCoverage * 100).toFixed(1)}% transparent)`
                      : 'No',
                  },
                  { label: 'Aspect ratio', value: `${(selected.width / selected.height).toFixed(3)}:1` },
                ]}
              />
            </Panel>
          )}
        </>
      )}
    </ToolShell>
  );
}

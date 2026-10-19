import { useMemo, useState } from 'react';
import { Download, RefreshCw, ScanSearch } from 'lucide-react';
import { ToolShell } from '../../../components/ToolShell';
import {
  Button,
  Field,
  Notice,
  Panel,
  ProgressBar,
  Stat,
  useToast,
} from '../../../components/ui';
import { DropZone, FileGrid, QueueHeader, useFileQueue } from '../../../components/files';
import { useTask } from '../../../core/hooks';
import { analyseAlpha, context2d, createCanvas, loadImage } from '../../../core/image';
import { downloadText } from '../../../core/files';
import { formatBytes, formatNumber, isPowerOfTwo } from '../../../core/format';
import { UserError } from '../../../core/errors';

interface AuditRow {
  name: string;
  size: number;
  width: number;
  height: number;
  pot: boolean;
  hasAlpha: boolean;
  vram: number;
  bcEstimate: number;
  flags: string[];
}

export default function TextureAudit() {
  const toast = useToast();
  const queue = useFileQueue({ accept: 'image/*', maxFiles: 100 });
  const [rows, setRows] = useState<AuditRow[]>([]);
  const task = useTask<AuditRow[]>();

  const totals = useMemo(() => {
    return {
      files: rows.length,
      size: rows.reduce((sum, r) => sum + r.size, 0),
      vram: rows.reduce((sum, r) => sum + r.vram, 0),
      nonPot: rows.filter((r) => !r.pot).length,
      oversized: rows.filter((r) => r.width > 2048 || r.height > 2048).length,
      withAlpha: rows.filter((r) => r.hasAlpha).length,
    };
  }, [rows]);

  const run = () =>
    task.run(async (report) => {
      if (!queue.items.length) throw new UserError('Add at least one image first.');
      const out: AuditRow[] = [];
      for (let i = 0; i < queue.items.length; i += 1) {
        const item = queue.items[i];
        report(i / queue.items.length, `Auditing ${item.file.name}`);
        const image = await loadImage(item.file);
        try {
          const canvas = createCanvas(image.width, image.height);
          const ctx = context2d(canvas);
          ctx.drawImage(image.source, 0, 0);
          const alpha = analyseAlpha(ctx.getImageData(0, 0, image.width, image.height));
          const pot = isPowerOfTwo(image.width) && isPowerOfTwo(image.height);
          const vram = image.width * image.height * 4;
          const flags: string[] = [];
          if (!pot) flags.push('non-POT');
          if (image.width > 2048 || image.height > 2048) flags.push('>2048 px');
          if (image.width * image.height > 4_194_304) flags.push('>4 MP');
          if (alpha.hasAlpha && item.file.type === 'image/jpeg') flags.push('alpha impossible in JPG');
          if (image.width === image.height && image.width >= 1024) flags.push('large square — atlas candidate');
          out.push({
            name: item.file.name,
            size: item.file.size,
            width: image.width,
            height: image.height,
            pot,
            hasAlpha: alpha.hasAlpha,
            vram,
            bcEstimate: Math.ceil(vram / 8),
            flags,
          });
        } finally {
          image.dispose();
        }
      }
      out.sort((a, b) => b.size - a.size);
      setRows(out);
      report(1, 'Done');
      return out;
    });

  const exportCsv = () => {
    const header = 'name,width,height,pot,alpha,file_size_bytes,vram_rgba8_bytes,bc4bpp_bytes,flags';
    const lines = rows.map((r) =>
      [
        `"${r.name.replace(/"/g, '""')}"`,
        r.width,
        r.height,
        r.pot ? 'yes' : 'no',
        r.hasAlpha ? 'yes' : 'no',
        r.size,
        r.vram,
        r.bcEstimate,
        `"${r.flags.join('; ')}"`,
      ].join(','),
    );
    downloadText([header, ...lines].join('\n'), 'texture-audit.csv', 'text/csv');
    toast.success('Audit exported.');
  };

  const reset = () => {
    queue.clear();
    setRows([]);
    task.reset();
  };

  return (
    <ToolShell
      sidebar={
        <>
          <Notice tone="info" title="What is measured">
            Dimensions and alpha come from decoding each file. VRAM is estimated as RGBA8
            (width × height × 4). The BC estimate assumes 4 bpp block compression and is a rough
            lower bound, not a promise — real GPU formats depend on your engine and platform.
          </Notice>
          <Field label="Limits" hint="Up to 100 files per audit.">
            <span className="dim tiny">Decoding stops early if memory runs out.</span>
          </Field>
        </>
      }
      actions={
        <>
          <Button variant="ghost" icon={<RefreshCw />} onClick={reset}>
            Reset
          </Button>
          <Button variant="primary" icon={<ScanSearch />} loading={task.running} disabled={!queue.items.length} onClick={run}>
            Audit textures
          </Button>
          <Button variant="success" icon={<Download />} disabled={!rows.length} onClick={exportCsv}>
            Export CSV
          </Button>
        </>
      }
      info={rows.length ? `${formatBytes(totals.size)} · ${formatBytes(totals.vram)} VRAM` : undefined}
    >
      {queue.items.length === 0 ? (
        <DropZone
          onFiles={(files) => queue.add(files)}
          accept="image/*"
          formats={['PNG', 'JPG', 'WebP']}
          size="lg"
          title="Drop textures to audit"
        />
      ) : (
        <Panel title="Textures" actions={<QueueHeader count={queue.items.length} onClear={queue.clear} />}>
          <FileGrid items={queue.items} onRemove={queue.remove} />
        </Panel>
      )}

      {task.running && (
        <Panel title="Progress">
          <ProgressBar value={task.progress} label={task.message} />
        </Panel>
      )}
      {task.error && (
        <Notice tone="error" title="Audit stopped">
          {task.error}
        </Notice>
      )}

      {rows.length > 0 && (
        <>
          <div className="grid-4">
            <Stat label="Files" value={formatNumber(totals.files)} />
            <Stat label="Download size" value={formatBytes(totals.size)} />
            <Stat label="Est. VRAM (RGBA8)" value={formatBytes(totals.vram)} tone={totals.vram > 512 * 1024 * 1024 ? 'warn' : 'neutral'} />
            <Stat label="Non-POT" value={formatNumber(totals.nonPot)} tone={totals.nonPot ? 'warn' : 'ok'} />
          </div>
          <div className="grid-2">
            <Stat label="Oversized (>2048)" value={formatNumber(totals.oversized)} tone={totals.oversized ? 'warn' : 'ok'} />
            <Stat label="With alpha" value={formatNumber(totals.withAlpha)} />
          </div>
          <Panel title="Per texture" flush>
            <div style={{ maxHeight: 420, overflow: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Size</th>
                    <th>File</th>
                    <th>VRAM</th>
                    <th>Flags</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.name}>
                      <td className="mono tiny">{r.name}</td>
                      <td className="mono tiny">{r.width} × {r.height}</td>
                      <td className="mono tiny">{formatBytes(r.size)}</td>
                      <td className="mono tiny">{formatBytes(r.vram)}</td>
                      <td className="tiny">
                        {r.flags.length ? (
                          <span style={{ color: 'var(--amber)' }}>{r.flags.join(' · ')}</span>
                        ) : (
                          <span className="dim">—</span>
                        )}
                      </td>
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

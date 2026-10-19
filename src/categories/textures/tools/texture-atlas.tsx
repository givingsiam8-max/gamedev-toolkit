import { useMemo, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { ToolShell } from '../../../components/ToolShell';
import {
  Button,
  CheckBox,
  Field,
  Notice,
  NumberInput,
  Panel,
  Stat,
  useToast,
} from '../../../components/ui';
import { DropZone, FileGrid, QueueHeader, useFileQueue } from '../../../components/files';
import { useObjectUrl, useTask } from '../../../core/hooks';
import { canvasToBlob, context2d, createCanvas, loadImage } from '../../../core/image';
import { downloadBlob, zipFiles } from '../../../core/files';
import { formatBytes, formatNumber, nextPowerOfTwo, stripExt } from '../../../core/format';
import { UserError } from '../../../core/errors';

interface Packed {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface AtlasResult {
  blob: Blob;
  width: number;
  height: number;
  regions: Packed[];
  utilization: number;
}

export default function TextureAtlas() {
  const toast = useToast();
  const queue = useFileQueue({ accept: 'image/*', maxFiles: 100 });
  const [padding, setPadding] = useState(2);
  const [pot, setPot] = useState(true);
  const [name, setName] = useState('atlas');
  const task = useTask<AtlasResult>();
  const previewUrl = useObjectUrl(task.result?.blob ?? null);

  const packShelf = (
    items: Array<{ name: string; w: number; h: number }>,
    pad: number,
    powerOfTwo: boolean,
  ): { width: number; height: number; regions: Packed[] } => {
    const area = items.reduce((sum, it) => sum + (it.w + pad * 2) * (it.h + pad * 2), 0);
    let width = Math.max(
      Math.ceil(Math.sqrt(area)),
      ...items.map((it) => it.w + pad * 2),
    );
    if (powerOfTwo) width = nextPowerOfTwo(width);

    const sorted = [...items].sort((a, b) => b.h - a.h);
    let x = pad;
    let y = pad;
    let shelfH = 0;
    const regions: Packed[] = [];

    for (const item of sorted) {
      if (x + item.w + pad > width) {
        x = pad;
        y += shelfH + pad;
        shelfH = 0;
      }
      regions.push({ name: item.name, x, y, w: item.w, h: item.h });
      x += item.w + pad;
      shelfH = Math.max(shelfH, item.h);
    }

    let height = y + shelfH + pad;
    if (powerOfTwo) height = nextPowerOfTwo(height);
    return { width, height, regions };
  };

  const run = () =>
    task.run(async (report) => {
      if (!queue.items.length) throw new UserError('Add at least one texture first.');
      const loaded: Array<{ name: string; image: Awaited<ReturnType<typeof loadImage>> }> = [];

      try {
        for (let i = 0; i < queue.items.length; i += 1) {
          const item = queue.items[i];
          report((i / queue.items.length) * 0.4, `Loading ${item.file.name}`);
          loaded.push({ name: item.file.name, image: await loadImage(item.file) });
        }

        const layout = packShelf(
          loaded.map((l) => ({ name: l.name, w: l.image.width, h: l.image.height })),
          padding,
          pot,
        );

        report(0.55, 'Packing');
        const canvas = createCanvas(layout.width, layout.height);
        const ctx = context2d(canvas);
        for (const region of layout.regions) {
          const source = loaded.find((l) => l.name === region.name);
          if (!source) continue;
          ctx.drawImage(source.image.source, region.x, region.y, region.w, region.h);
        }

        report(0.85, 'Encoding atlas');
        const blob = await canvasToBlob(canvas, 'image/png');
        const usedArea = layout.regions.reduce((sum, r) => sum + r.w * r.h, 0);
        report(1, 'Done');
        return {
          blob,
          width: layout.width,
          height: layout.height,
          regions: layout.regions,
          utilization: usedArea / (layout.width * layout.height),
        };
      } finally {
        for (const l of loaded) l.image.dispose();
      }
    });

  const atlasJson = useMemo(() => {
    if (!task.result) return '';
    const frames: Record<string, unknown> = {};
    for (const r of task.result.regions) {
      frames[r.name] = {
        frame: { x: r.x, y: r.y, w: r.w, h: r.h },
        rotated: false,
        trimmed: false,
        spriteSourceSize: { x: 0, y: 0, w: r.w, h: r.h },
        sourceSize: { w: r.w, h: r.h },
      };
    }
    return JSON.stringify(
      {
        meta: {
          app: 'GameDev Toolkit',
          version: 1,
          image: `${name || 'atlas'}.png`,
          format: 'RGBA8888',
          size: { w: task.result.width, h: task.result.height },
          scale: '1',
        },
        frames,
      },
      null,
      2,
    );
  }, [task.result, name]);

  const download = async (json: boolean) => {
    if (!task.result) return;
    if (json) {
      const zip = await zipFiles([
        { name: `${name || 'atlas'}.png`, data: task.result.blob },
        { name: `${name || 'atlas'}.json`, data: atlasJson },
      ]);
      downloadBlob(zip, `${name || 'atlas'}.zip`);
      toast.success('Atlas and region map exported.');
    } else {
      downloadBlob(task.result.blob, `${name || 'atlas'}.png`);
    }
  };

  const reset = () => {
    task.reset();
    queue.clear();
  };

  return (
    <ToolShell
      sidebar={
        <>
          <Field label="Atlas name">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Padding (px)" hint="Space around each texture; prevents bleeding when the atlas is filtered or mipmapped.">
            <NumberInput value={padding} min={0} max={32} onChange={setPadding} />
          </Field>
          <CheckBox checked={pot} onChange={setPot} label="Power-of-two dimensions" />
          <Notice tone="info">
            Shelf packer: textures are sorted by height and laid into rows. The JSON uses the
            TexturePacker-style frame map so engines can read the region rectangles.
          </Notice>
        </>
      }
      actions={
        <>
          <Button variant="ghost" icon={<RefreshCw />} onClick={reset}>
            Reset
          </Button>
          <Button variant="primary" loading={task.running} disabled={!queue.items.length} onClick={run}>
            Build atlas
          </Button>
          <Button variant="outline" icon={<Download />} disabled={!task.result} onClick={() => download(false)}>
            PNG
          </Button>
          <Button variant="success" icon={<Download />} disabled={!task.result} onClick={() => download(true)}>
            PNG + JSON
          </Button>
        </>
      }
      info={task.result ? `${task.result.width} × ${task.result.height}` : undefined}
    >
      {queue.items.length === 0 ? (
        <DropZone
          onFiles={(files) => queue.add(files)}
          accept="image/*"
          formats={['PNG', 'JPG', 'WebP']}
          size="lg"
          title="Drop textures to pack"
        />
      ) : (
        <Panel title="Textures" actions={<QueueHeader count={queue.items.length} onClear={queue.clear} />}>
          <FileGrid items={queue.items} onRemove={queue.remove} />
        </Panel>
      )}

      {task.error && (
        <Notice tone="error" title="Could not build the atlas">
          {task.error}
        </Notice>
      )}

      {task.result && previewUrl && (
        <>
          <div className="grid-3">
            <Stat label="Atlas size" value={`${task.result.width} × ${task.result.height}`} />
            <Stat label="Textures" value={formatNumber(task.result.regions.length)} />
            <Stat
              label="Fill rate"
              value={`${(task.result.utilization * 100).toFixed(1)}%`}
              tone={task.result.utilization > 0.6 ? 'ok' : 'warn'}
            />
          </div>
          <Panel title="Preview">
            <div className="stage checker">
              <img src={previewUrl} alt="Atlas" style={{ maxWidth: '100%', maxHeight: 460, display: 'block' }} />
            </div>
          </Panel>
          <Panel title="Regions" flush>
            <div style={{ maxHeight: 260, overflow: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>X</th>
                    <th>Y</th>
                    <th>W</th>
                    <th>H</th>
                  </tr>
                </thead>
                <tbody>
                  {task.result.regions.map((r) => (
                    <tr key={r.name}>
                      <td className="mono tiny">{stripExt(r.name)}</td>
                      <td className="mono tiny">{r.x}</td>
                      <td className="mono tiny">{r.y}</td>
                      <td className="mono tiny">{r.w}</td>
                      <td className="mono tiny">{r.h}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
          <Stat label="PNG size" value={formatBytes(task.result.blob.size)} />
        </>
      )}
    </ToolShell>
  );
}

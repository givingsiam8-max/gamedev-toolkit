import { useState } from 'react';
import { Copy, Download, RefreshCw } from 'lucide-react';
import { ToolShell } from '../../../components/ToolShell';
import {
  Button,
  Notice,
  Panel,
  SliderField,
  Stat,
  useToast,
} from '../../../components/ui';
import { DropZone, FileGrid, QueueHeader, useFileQueue } from '../../../components/files';
import { useTask } from '../../../core/hooks';
import { context2d, createCanvas, loadImage } from '../../../core/image';
import { downloadText } from '../../../core/files';
import { formatBytes, formatNumber } from '../../../core/format';
import { UserError } from '../../../core/errors';

interface Entry {
  id: string;
  name: string;
  size: number;
  previewUrl: string | null;
  sha: string;
  hi: number;
  lo: number;
}

interface Group {
  kind: 'exact' | 'similar';
  entries: Entry[];
  distance?: number;
}

function popcount(value: number): number {
  let x = value >>> 0;
  x = x - ((x >>> 1) & 0x55555555);
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  x = (x + (x >>> 4)) & 0x0f0f0f0f;
  return (x * 0x01010101) >>> 24;
}

function distance(a: Entry, b: Entry): number {
  return popcount(a.hi ^ b.hi) + popcount(a.lo ^ b.lo);
}

async function sha256(file: File): Promise<string> {
  const bytes = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function dHash(file: File): Promise<{ hi: number; lo: number }> {
  const image = await loadImage(file);
  try {
    const canvas = createCanvas(9, 8);
    const ctx = context2d(canvas);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image.source, 0, 0, 9, 8);
    const data = ctx.getImageData(0, 0, 9, 8).data;
    const gray = (x: number, y: number): number => {
      const i = (y * 9 + x) * 4;
      return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    };
    let hi = 0;
    let lo = 0;
    let bit = 0;
    for (let y = 0; y < 8; y += 1) {
      for (let x = 0; x < 8; x += 1) {
        const value = gray(x, y) < gray(x + 1, y) ? 1 : 0;
        if (bit < 32) hi = ((hi << 1) | value) >>> 0;
        else lo = ((lo << 1) | value) >>> 0;
        bit += 1;
      }
    }
    return { hi, lo };
  } finally {
    image.dispose();
  }
}

export default function DuplicateImageFinder() {
  const toast = useToast();
  const queue = useFileQueue({ accept: 'image/*', maxFiles: 200 });
  const [threshold, setThreshold] = useState(6);
  const [groups, setGroups] = useState<Group[]>([]);
  const task = useTask<Group[]>();

  const run = () =>
    task.run(async (report) => {
      if (queue.items.length < 2) throw new UserError('Add at least two images to compare.');
      const entries: Entry[] = [];
      for (let i = 0; i < queue.items.length; i += 1) {
        const item = queue.items[i];
        report((i / queue.items.length) * 0.8, `Hashing ${item.file.name}`);
        const [sha, hash] = await Promise.all([sha256(item.file), dHash(item.file)]);
        entries.push({
          id: item.id,
          name: item.file.name,
          size: item.file.size,
          previewUrl: item.previewUrl,
          sha,
          hi: hash.hi,
          lo: hash.lo,
        });
      }

      report(0.85, 'Comparing');
      const parent = entries.map((_, index) => index);
      const find = (index: number): number => {
        let current = index;
        while (parent[current] !== current) {
          parent[current] = parent[parent[current]];
          current = parent[current];
        }
        return current;
      };
      const union = (a: number, b: number) => {
        const rootA = find(a);
        const rootB = find(b);
        if (rootA !== rootB) parent[rootB] = rootA;
      };

      const exact = new Map<string, number>();
      entries.forEach((entry, index) => {
        const existing = exact.get(entry.sha);
        if (existing !== undefined) union(existing, index);
        else exact.set(entry.sha, index);
      });

      for (let i = 0; i < entries.length; i += 1) {
        for (let j = i + 1; j < entries.length; j += 1) {
          if (entries[i].sha === entries[j].sha) continue;
          if (distance(entries[i], entries[j]) <= threshold) union(i, j);
        }
      }

      const buckets = new Map<number, Entry[]>();
      entries.forEach((entry, index) => {
        const root = find(index);
        const bucket = buckets.get(root);
        if (bucket) bucket.push(entry);
        else buckets.set(root, [entry]);
      });

      const result: Group[] = [];
      for (const bucket of buckets.values()) {
        if (bucket.length < 2) continue;
        const allExact = bucket.every((entry) => entry.sha === bucket[0].sha);
        let worst = 0;
        for (let i = 0; i < bucket.length; i += 1) {
          for (let j = i + 1; j < bucket.length; j += 1) {
            worst = Math.max(worst, distance(bucket[i], bucket[j]));
          }
        }
        result.push({ kind: allExact ? 'exact' : 'similar', entries: bucket, distance: allExact ? 0 : worst });
      }
      result.sort((a, b) => b.entries.length - a.entries.length);
      setGroups(result);
      report(1, 'Done');
      return result;
    });

  const exportReport = () => {
    const report = groups.map((group) => ({
      kind: group.kind,
      distance: group.distance ?? 0,
      files: group.entries.map((entry) => ({
        name: entry.name,
        size: entry.size,
        sha256: entry.sha,
        dhash: `${entry.hi.toString(16)}${entry.lo.toString(16)}`,
      })),
    }));
    downloadText(JSON.stringify(report, null, 2), 'duplicate-report.json', 'application/json');
    toast.success('Report exported.');
  };

  const reset = () => {
    queue.clear();
    setGroups([]);
    task.reset();
  };

  const duplicateFiles = groups.reduce((sum, group) => sum + group.entries.length - 1, 0);

  return (
    <ToolShell
      sidebar={
        <>
          <SliderField
            label="Similarity threshold"
            value={threshold}
            min={0}
            max={20}
            onChange={setThreshold}
            format={(v) => `${v} bits`}
            hint="Hamming distance between 64-bit dHashes. 0 = identical hashes, higher = looser."
          />
          <Notice tone="info" title="Two checks">
            Exact duplicates use SHA-256 of the file bytes. Near duplicates use a 64-bit dHash
            (9×8 grayscale difference) — it catches resized and re-encoded copies, not crops.
          </Notice>
        </>
      }
      actions={
        <>
          <Button variant="ghost" icon={<RefreshCw />} onClick={reset}>
            Reset
          </Button>
          <Button variant="primary" icon={<Copy />} loading={task.running} disabled={queue.items.length < 2} onClick={run}>
            Find duplicates
          </Button>
          <Button variant="success" icon={<Download />} disabled={!groups.length} onClick={exportReport}>
            Export report
          </Button>
        </>
      }
      info={groups.length ? `${groups.length} group(s), ${duplicateFiles} extra file(s)` : undefined}
    >
      {queue.items.length === 0 ? (
        <DropZone
          onFiles={(files) => queue.add(files)}
          accept="image/*"
          formats={['PNG', 'JPG', 'WebP']}
          size="lg"
          title="Drop images to compare"
        />
      ) : (
        <Panel title="Images" actions={<QueueHeader count={queue.items.length} onClear={queue.clear} />}>
          <FileGrid items={queue.items} onRemove={queue.remove} />
        </Panel>
      )}

      {task.running && <Panel title="Working"><div className="dim tiny">{task.message || 'Hashing…'}</div></Panel>}
      {task.error && (
        <Notice tone="error" title="Could not compare">
          {task.error}
        </Notice>
      )}

      {groups.length === 0 && task.status === 'done' && (
        <Notice tone="success" title="No duplicates found">
          Every dropped image has a distinct hash at this threshold.
        </Notice>
      )}

      {groups.map((group, index) => (
        <Panel
          key={index}
          title={`Group ${index + 1} — ${group.kind === 'exact' ? 'exact match' : `similar (≤ ${group.distance} bits)`}`}
          actions={<span className="badge badge-accent">{group.entries.length} files</span>}
        >
          <div className="row-wrap" style={{ gap: 12 }}>
            {group.entries.map((entry) => (
              <div key={entry.id} className="stack-sm" style={{ width: 150 }}>
                <div
                  className="checker"
                  style={{
                    height: 100,
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                  }}
                >
                  {entry.previewUrl ? (
                    <img src={entry.previewUrl} alt={entry.name} style={{ maxWidth: '100%', maxHeight: '100%' }} />
                  ) : (
                    <span className="dim tiny">no preview</span>
                  )}
                </div>
                <span className="tiny truncate" title={entry.name}>{entry.name}</span>
                <span className="dim tiny mono">{formatBytes(entry.size)}</span>
              </div>
            ))}
          </div>
        </Panel>
      ))}

      {groups.length > 0 && (
        <div className="grid-3">
          <Stat label="Groups" value={formatNumber(groups.length)} />
          <Stat label="Exact groups" value={formatNumber(groups.filter((g) => g.kind === 'exact').length)} />
          <Stat label="Redundant files" value={formatNumber(duplicateFiles)} tone="warn" />
        </div>
      )}
    </ToolShell>
  );
}

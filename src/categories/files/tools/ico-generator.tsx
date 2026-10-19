import { useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { ToolShell } from '../../../components/ToolShell';
import { Button, CheckBox, Field, Notice, Panel, Stat } from '../../../components/ui';
import { DropZone } from '../../../components/files';
import { canvasToBlob, loadImage, resizeToCanvas } from '../../../core/image';
import { downloadBlob } from '../../../core/files';
import { useObjectUrl, useTask } from '../../../core/hooks';
import { UserError } from '../../../core/errors';
import { formatBytes, stripExt } from '../../../core/format';

const SIZES = [16, 24, 32, 48, 64, 128, 256];

interface EncodedIcon {
  size: number;
  data: Uint8Array;
}

/**
 * Builds an ICO container: ICONDIR header, one 16-byte ICONDIRENTRY per image,
 * then the PNG payloads. A width or height byte of 0 means 256.
 */
export function buildIco(images: EncodedIcon[]): Uint8Array {
  const headerSize = 6 + 16 * images.length;
  const total = headerSize + images.reduce((sum, img) => sum + img.data.length, 0);
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint16(0, 0, true);
  view.setUint16(2, 1, true);
  view.setUint16(4, images.length, true);

  let offset = headerSize;
  images.forEach((img, i) => {
    const e = 6 + i * 16;
    const dim = img.size >= 256 ? 0 : img.size;
    out[e] = dim;
    out[e + 1] = dim;
    out[e + 2] = 0;
    out[e + 3] = 0;
    view.setUint16(e + 4, 1, true);
    view.setUint16(e + 6, 32, true);
    view.setUint32(e + 8, img.data.length, true);
    view.setUint32(e + 12, offset, true);
    out.set(img.data, offset);
    offset += img.data.length;
  });
  return out;
}

export default function IcoGenerator() {
  const [file, setFile] = useState<File | null>(null);
  const [sizes, setSizes] = useState<number[]>([16, 32, 48, 256]);
  const sourceUrl = useObjectUrl(file);
  const task = useTask<{ blob: Blob; name: string; bytes: number }>();

  const toggle = (size: number) =>
    setSizes((cur) => (cur.includes(size) ? cur.filter((s) => s !== size) : [...cur, size].sort((a, b) => a - b)));

  const onFiles = (files: File[]) => {
    const f = files[0];
    if (!f) return;
    setFile(f);
    task.reset();
  };

  const build = () =>
    task.run(async (report) => {
      if (!file) throw new UserError('Choose a source image first.');
      if (!sizes.length) throw new UserError('Select at least one icon size.');
      const image = await loadImage(file);
      try {
        const encoded: EncodedIcon[] = [];
        for (let i = 0; i < sizes.length; i += 1) {
          const size = sizes[i];
          report(i / sizes.length, `Rendering ${size}×${size}`);
          const canvas = resizeToCanvas(image, size, size, { cover: false });
          const png = await canvasToBlob(canvas, 'image/png');
          encoded.push({ size, data: new Uint8Array(await png.arrayBuffer()) });
        }
        report(1, 'Packing ICO');
        const ico = buildIco(encoded);
        return {
          blob: new Blob([ico as BlobPart], { type: 'image/x-icon' }),
          name: `${stripExt(file.name)}.ico`,
          bytes: ico.length,
        };
      } finally {
        image.dispose();
      }
    });

  return (
    <ToolShell
      sidebar={
        <Field label="Icon sizes" hint="256 px is stored as PNG inside the ICO, as modern Windows expects.">
          <div className="stack-sm">
            {SIZES.map((s) => (
              <CheckBox key={s} checked={sizes.includes(s)} onChange={() => toggle(s)} label={`${s} × ${s}`} />
            ))}
          </div>
        </Field>
      }
      actions={
        <>
          <Button
            variant="ghost"
            icon={<RefreshCw />}
            onClick={() => {
              setFile(null);
              setSizes([16, 32, 48, 256]);
              task.reset();
            }}
          >
            Reset
          </Button>
          <Button variant="primary" loading={task.running} disabled={!file} onClick={build}>
            Build .ico
          </Button>
          <Button
            variant="success"
            icon={<Download />}
            disabled={!task.result}
            onClick={() => task.result && downloadBlob(task.result.blob, task.result.name)}
          >
            Download
          </Button>
        </>
      }
    >
      {!file ? (
        <DropZone onFiles={onFiles} accept="image/*" multiple={false} formats={['PNG', 'JPG', 'WebP']} size="lg" title="Drop a square source image" hint="A square PNG with transparency gives the best result." />
      ) : (
        <Panel title={file.name}>
          <div className="stage checker" style={{ minHeight: 200 }}>
            <img src={sourceUrl ?? undefined} alt="Source" style={{ maxHeight: 260, maxWidth: '100%', objectFit: 'contain' }} />
          </div>
        </Panel>
      )}
      {task.error && <Notice tone="error" title="Could not build the icon">{task.error}</Notice>}
      {task.result && (
        <div className="grid-2">
          <Stat label="Images in file" value={String(sizes.length)} />
          <Stat label="ICO size" value={formatBytes(task.result.bytes)} />
        </div>
      )}
    </ToolShell>
  );
}

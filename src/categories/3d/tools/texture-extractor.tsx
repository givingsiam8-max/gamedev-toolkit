import { useState } from 'react';
import { Download, Package, RefreshCw } from 'lucide-react';
import { ToolShell } from '../../../components/ToolShell';
import {
  Button,
  Notice,
  Panel,
  ProgressBar,
  Stat,
  useToast,
} from '../../../components/ui';
import { DropZone } from '../../../components/files';
import { useObjectUrl, useTask } from '../../../core/hooks';
import { downloadBlob, zipFiles } from '../../../core/files';
import { formatBytes, formatNumber, stripExt } from '../../../core/format';
import { UserError } from '../../../core/errors';

interface GltfImage {
  uri?: string;
  bufferView?: number;
  mimeType?: string;
  name?: string;
}

interface GltfTexture {
  source?: number;
}

interface GltfMaterial {
  name?: string;
  pbrMetallicRoughness?: {
    baseColorTexture?: { index?: number };
    metallicRoughnessTexture?: { index?: number };
  };
  normalTexture?: { index?: number };
  occlusionTexture?: { index?: number };
  emissiveTexture?: { index?: number };
}

interface GltfJson {
  images?: GltfImage[];
  bufferViews?: Array<{ byteOffset?: number; byteLength: number }>;
  buffers?: Array<{ byteLength: number; uri?: string }>;
  textures?: GltfTexture[];
  materials?: GltfMaterial[];
}

interface Extracted {
  name: string;
  blob: Blob;
}

interface Result {
  images: Extracted[];
  report: string;
  warnings: string[];
}

function extForMime(mime: string): string {
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('ktx')) return 'ktx2';
  if (mime.includes('png')) return 'png';
  return 'bin';
}

function parseGlb(buffer: ArrayBuffer): { json: GltfJson; bin: Uint8Array | null } {
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== 0x46546c67) throw new UserError('This is not a GLB file.');
  if (view.getUint32(4, true) !== 2) throw new UserError('Only glTF 2.0 files are supported.');
  const total = view.getUint32(8, true);
  let offset = 12;
  let json: GltfJson | null = null;
  let bin: Uint8Array | null = null;

  while (offset < total) {
    const length = view.getUint32(offset, true);
    const type = view.getUint32(offset + 4, true);
    const data = new Uint8Array(buffer, offset + 8, length);
    if (type === 0x4e4f534a) {
      json = JSON.parse(new TextDecoder().decode(data)) as GltfJson;
    } else if (type === 0x004e4942) {
      bin = data;
    }
    offset += 8 + length;
  }
  if (!json) throw new UserError('The GLB has no JSON chunk.');
  return { json, bin };
}

function base64ToBytes(dataUri: string): Uint8Array {
  const comma = dataUri.indexOf(',');
  if (comma < 0) throw new Error('Malformed data URI');
  const payload = dataUri.slice(comma + 1);
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function extract(file: File): Promise<Result> {
  const isGlb = file.name.toLowerCase().endsWith('.glb');
  let json: GltfJson;
  let bin: Uint8Array | null = null;
  const warnings: string[] = [];

  if (isGlb) {
    ({ json, bin } = parseGlb(await file.arrayBuffer()));
  } else {
    json = JSON.parse(await file.text()) as GltfJson;
    if (json.buffers?.some((buffer) => buffer.uri && !buffer.uri.startsWith('data:'))) {
      warnings.push('This .gltf references external .bin buffers; only embedded data can be extracted in the browser.');
    }
  }

  const base = stripExt(file.name);
  const images: Extracted[] = [];
  const imageNames: string[] = [];

  for (let index = 0; index < (json.images?.length ?? 0); index += 1) {
    const image = json.images![index];
    const mime = image.mimeType ?? (image.uri?.startsWith('data:') ? image.uri.slice(5, image.uri.indexOf(';')) : 'image/png');
    const extension = extForMime(mime);
    const name = `${image.name || `${base}_texture_${String(index).padStart(2, '0')}`}.${extension}`;
    imageNames.push(name);

    if (image.uri && image.uri.startsWith('data:')) {
      const bytes = base64ToBytes(image.uri);
      images.push({ name, blob: new Blob([bytes as BlobPart], { type: mime }) });
    } else if (image.uri) {
      warnings.push(`Image ${index} uses an external URI (${image.uri}) and was skipped.`);
    } else if (image.bufferView !== undefined) {
      const view = json.bufferViews?.[image.bufferView];
      if (!view) {
        warnings.push(`Image ${index} references a missing bufferView.`);
        continue;
      }
      if (!bin) {
        warnings.push(`Image ${index} lives in an external buffer and was skipped.`);
        continue;
      }
      const start = view.byteOffset ?? 0;
      const slice = bin.subarray(start, start + view.byteLength);
      images.push({ name, blob: new Blob([slice as BlobPart], { type: mime }) });
    }
  }

  const textures = json.textures ?? [];
  const materials = (json.materials ?? []).map((material, index) => {
    const textureName = (textureIndex?: number): string | null => {
      if (textureIndex === undefined) return null;
      const source = textures[textureIndex]?.source;
      return source !== undefined ? imageNames[source] ?? null : null;
    };
    return {
      name: material.name ?? `material_${index}`,
      baseColor: textureName(material.pbrMetallicRoughness?.baseColorTexture?.index),
      metallicRoughness: textureName(material.pbrMetallicRoughness?.metallicRoughnessTexture?.index),
      normal: textureName(material.normalTexture?.index),
      occlusion: textureName(material.occlusionTexture?.index),
      emissive: textureName(material.emissiveTexture?.index),
    };
  });

  const report = JSON.stringify(
    {
      source: file.name,
      images: images.map((image) => image.name),
      materials,
      notes: warnings,
    },
    null,
    2,
  );

  return { images, report, warnings };
}

export default function TextureExtractor() {
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [firstUrl, setFirstUrl] = useState<string | null>(null);
  const task = useTask<Result>();
  const previewUrl = useObjectUrl(result?.images[0]?.blob ?? null);

  const onFiles = async (files: File[]) => {
    const picked = files[0];
    if (!picked) return;
    setFile(picked);
    setResult(null);
    setFirstUrl(null);
    await task.run(async () => {
      const value = await extract(picked);
      setResult(value);
      if (value.images[0]) setFirstUrl(URL.createObjectURL(value.images[0].blob));
      return value;
    });
  };

  const exportZip = async () => {
    if (!result) return;
    const entries = [
      ...result.images.map((image) => ({ name: image.name, data: image.blob })),
      { name: 'materials.json', data: new Blob([result.report], { type: 'application/json' }) },
    ];
    const zip = await zipFiles(entries);
    downloadBlob(zip, `${stripExt(file?.name ?? 'model')}-textures.zip`);
    toast.success('Textures and materials.json exported.');
  };

  const reset = () => {
    setFile(null);
    setResult(null);
    setFirstUrl(null);
    task.reset();
  };

  return (
    <ToolShell
      sidebar={
        <Notice tone="info" title="Embedded assets">
          This reads the glTF container directly. Embedded images (data URIs and GLB buffer views)
          are extracted at their original resolution; external file references are listed but cannot
          be fetched in the browser.
        </Notice>
      }
      actions={
        <>
          <Button variant="ghost" icon={<RefreshCw />} onClick={reset}>
            Reset
          </Button>
          <Button variant="primary" loading={task.running} disabled={!file} onClick={() => file && void onFiles([file])}>
            Re-extract
          </Button>
          <Button variant="success" icon={<Download />} disabled={!result?.images.length} onClick={() => void exportZip()}>
            Download ZIP
          </Button>
        </>
      }
      info={result ? `${formatNumber(result.images.length)} texture(s)` : undefined}
    >
      {!file ? (
        <DropZone
          onFiles={(files) => void onFiles(files)}
          accept=".glb,.gltf,model/gltf-binary,model/gltf+json"
          formats={['GLB', 'GLTF']}
          size="lg"
          multiple={false}
          icon={<Package />}
          title="Drop a GLB or glTF file"
        />
      ) : (
        <Panel title={file.name}>
          {task.running && (
            <div className="stack-sm">
              <span className="dim tiny">Reading container…</span>
              <ProgressBar value={task.progress} label={task.message} />
            </div>
          )}
          {task.error && (
            <Notice tone="error" title="Could not read the model">
              {task.error}
            </Notice>
          )}
          {previewUrl && firstUrl && (
            <div className="stage checker">
              <img src={previewUrl} alt="Extracted texture" style={{ maxWidth: '100%', maxHeight: 320, display: 'block' }} />
            </div>
          )}
        </Panel>
      )}

      {result && result.warnings.length > 0 && (
        <Notice tone="warning" title="Skipped or partial data">
          {result.warnings.join(' ')}
        </Notice>
      )}

      {result && result.images.length === 0 && (
        <Notice tone="info" title="No embedded textures found">
          This file may reference external images, or contain no textures at all.
        </Notice>
      )}

      {result && result.images.length > 0 && (
        <>
          <div className="grid-2">
            <Stat label="Textures extracted" value={formatNumber(result.images.length)} />
            <Stat label="Total size" value={formatBytes(result.images.reduce((sum, image) => sum + image.blob.size, 0))} />
          </div>
          <Panel title="Extracted textures">
            <div className="stack-sm">
              {result.images.map((image) => (
                <div key={image.name} className="row spread tiny">
                  <span className="mono truncate" style={{ maxWidth: 320 }}>{image.name}</span>
                  <span className="dim mono">{formatBytes(image.blob.size)}</span>
                </div>
              ))}
            </div>
          </Panel>
          <Panel title="materials.json">
            <pre className="code" style={{ maxHeight: 320 }}>{result.report}</pre>
          </Panel>
        </>
      )}
    </ToolShell>
  );
}

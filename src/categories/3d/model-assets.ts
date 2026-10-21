/**
 * Generic 3D asset loading for the asset extractor. FBX has its own container
 * scanner in `fbx.ts`; this module covers the other formats three.js can decode
 * in the browser and keeps external resource references visible instead of
 * fetching them.
 */
import * as THREE from 'three';
import { ColladaLoader } from 'three/examples/jsm/loaders/ColladaLoader.js';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { TDSLoader } from 'three/examples/jsm/loaders/TDSLoader.js';
import { UserError } from '../../core/errors';
import { safeFileName, stripExt } from '../../core/format';

export type AssetModelFormat =
  | 'fbx'
  | 'glb'
  | 'gltf'
  | 'obj'
  | 'stl'
  | 'ply'
  | 'dae'
  | '3ds';

const GENERIC_FORMATS = ['glb', 'gltf', 'obj', 'stl', 'ply', 'dae', '3ds'] as const;
const ALL_FORMATS: readonly AssetModelFormat[] = ['fbx', ...GENERIC_FORMATS];

export const ASSET_MODEL_ACCEPT = '.fbx,.glb,.gltf,.obj,.stl,.ply,.dae,.3ds';
export const ASSET_MODEL_LABELS = [
  'FBX',
  'GLB',
  'GLTF',
  'OBJ',
  'STL',
  'PLY',
  'DAE',
  '3DS',
];

/** Formats that can contain textures; the others are geometry-only. */
export const TEXTURE_CAPABLE = new Set<AssetModelFormat>([
  'fbx',
  'glb',
  'gltf',
  'dae',
  '3ds',
]);

export function detectAssetFormat(fileName: string): AssetModelFormat | null {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  return (ALL_FORMATS as readonly string[]).includes(ext)
    ? (ext as AssetModelFormat)
    : null;
}

const TRANSPARENT_PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=';

interface ExternalCollector {
  refs: Set<string>;
  manager: THREE.LoadingManager;
}

function createManager(): ExternalCollector {
  const refs = new Set<string>();
  const manager = new THREE.LoadingManager();
  manager.setURLModifier((url) => {
    if (
      !url ||
      url.startsWith('blob:') ||
      url.startsWith('data:') ||
      url.startsWith('javascript:')
    ) {
      return url;
    }
    refs.add(url.replace(/\\/g, '/'));
    return TRANSPARENT_PIXEL;
  });
  return { refs, manager };
}

export interface EmbeddedModelImage {
  name: string;
  blob: Blob;
}

export interface LoadedGenericModel {
  root: THREE.Object3D;
  format: Exclude<AssetModelFormat, 'fbx'>;
  animations: THREE.AnimationClip[];
  externalRefs: string[];
  warnings: string[];
  /** Original bytes for images embedded in a GLB/GLTF container. */
  embeddedImages: EmbeddedModelImage[];
}

interface GltfJson {
  buffers?: Array<{ byteLength?: number; uri?: string }>;
  bufferViews?: Array<{ buffer?: number; byteOffset?: number; byteLength: number }>;
  images?: Array<{
    uri?: string;
    bufferView?: number;
    mimeType?: string;
    name?: string;
  }>;
}

function parseGlbContainer(buffer: ArrayBuffer): {
  json: GltfJson;
  bin: Uint8Array | null;
} {
  const view = new DataView(buffer);
  if (view.byteLength < 20 || view.getUint32(0, true) !== 0x46546c67) {
    throw new UserError('This is not a valid GLB file.');
  }
  if (view.getUint32(4, true) !== 2) {
    throw new UserError('Only glTF 2.0 GLB files are supported.');
  }
  const total = Math.min(buffer.byteLength, view.getUint32(8, true));
  let offset = 12;
  let json: GltfJson | null = null;
  let bin: Uint8Array | null = null;

  while (offset + 8 <= total) {
    const length = view.getUint32(offset, true);
    const type = view.getUint32(offset + 4, true);
    const start = offset + 8;
    if (length === 0 || start + length > buffer.byteLength) break;
    if (type === 0x4e4f534a) {
      json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, start, length))) as GltfJson;
    } else if (type === 0x004e4942) {
      bin = new Uint8Array(buffer, start, length);
    }
    offset = start + length;
  }

  if (!json) throw new UserError('The GLB has no JSON chunk.');
  return { json, bin };
}

function decodeBase64(payload: string): Uint8Array {
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function dataUriBytes(uri: string): { bytes: Uint8Array; mime: string } {
  const comma = uri.indexOf(',');
  if (comma < 0) throw new Error('Malformed data URI');
  const metadata = uri.slice(5, comma);
  const mime = metadata.split(';')[0] || 'application/octet-stream';
  if (metadata.includes(';base64')) {
    return { bytes: decodeBase64(uri.slice(comma + 1)), mime };
  }
  const text = decodeURIComponent(uri.slice(comma + 1));
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i += 1) bytes[i] = text.charCodeAt(i) & 0xff;
  return { bytes, mime };
}

function mimeForBytes(bytes: Uint8Array): string {
  const starts = (...signature: number[]) =>
    signature.every((value, index) => bytes[index] === value);
  if (starts(0x89, 0x50, 0x4e, 0x47)) return 'image/png';
  if (starts(0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (starts(0x47, 0x49, 0x46, 0x38)) return 'image/gif';
  if (starts(0x42, 0x4d)) return 'image/bmp';
  if (starts(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57) return 'image/webp';
  if (starts(0xab, 0x4b, 0x54, 0x58, 0x20)) return 'image/ktx2';
  return 'application/octet-stream';
}

function extensionForMime(mime: string): string {
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('gif')) return 'gif';
  if (mime.includes('bmp')) return 'bmp';
  if (mime.includes('ktx')) return 'ktx2';
  if (mime.includes('tiff')) return 'tif';
  if (mime.includes('dds')) return 'dds';
  return 'png';
}

function uniqueImageName(base: string, extension: string, used: Set<string>): string {
  let candidate = `${base}.${extension}`;
  let counter = 2;
  while (used.has(candidate.toLowerCase())) {
    candidate = `${base}-${counter}.${extension}`;
    counter += 1;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

async function extractGltfImages(
  file: File,
  json: GltfJson,
  bin: Uint8Array | null,
  buffers: Array<Uint8Array | null>,
  externalRefs: Set<string>,
  warnings: string[],
): Promise<EmbeddedModelImage[]> {
  const images: EmbeddedModelImage[] = [];
  const used = new Set<string>();
  const base = safeFileName(stripExt(file.name), 'model');

  for (let index = 0; index < (json.images?.length ?? 0); index += 1) {
    const image = json.images![index];
    let bytes: Uint8Array | null = null;
    let mime = image.mimeType ?? '';

    if (image.uri?.startsWith('data:')) {
      const decoded = dataUriBytes(image.uri);
      bytes = decoded.bytes;
      mime = image.mimeType ?? decoded.mime;
    } else if (image.uri) {
      externalRefs.add(image.uri);
      warnings.push(`Image "${image.uri}" is an external file and was not extracted.`);
      continue;
    } else if (image.bufferView !== undefined) {
      const view = json.bufferViews?.[image.bufferView];
      if (!view) {
        warnings.push(`Image ${index} references a missing bufferView.`);
        continue;
      }
      const bufferIndex = view.buffer ?? 0;
      const buffer = buffers[bufferIndex] ?? (bufferIndex === 0 ? bin : null);
      if (!buffer) {
        warnings.push(`Image ${index} lives in an external buffer and was skipped.`);
        continue;
      }
      const start = view.byteOffset ?? 0;
      bytes = buffer.subarray(start, start + view.byteLength);
    } else {
      warnings.push(`Image ${index} has no embedded data.`);
      continue;
    }

    if (!bytes?.byteLength) continue;
    if (!mime || mime === 'application/octet-stream') mime = mimeForBytes(bytes);
    const extension = extensionForMime(mime);
    const rawName = image.name ? safeFileName(image.name, `texture_${index + 1}`) : '';
    const nameBase = rawName ? stripExt(rawName) : `${base}_texture_${String(index + 1).padStart(2, '0')}`;
    images.push({
      name: uniqueImageName(nameBase || `texture_${index + 1}`, extension, used),
      blob: new Blob([bytes as BlobPart], { type: mime }),
    });
  }

  return images;
}

function parseGltf(
  loader: GLTFLoader,
  data: ArrayBuffer | string,
): Promise<GLTF> {
  return new Promise((resolve, reject) => {
    loader.parse(
      data,
      '',
      resolve,
      (error: unknown) =>
        reject(error instanceof Error ? error : new Error('glTF parsing failed')),
    );
  });
}

function wrapGeometry(geometry: THREE.BufferGeometry, name: string): THREE.Group {
  if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({
    color: 0xb9bec8,
    metalness: 0.05,
    roughness: 0.6,
    vertexColors: geometry.hasAttribute('color'),
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  const root = new THREE.Group();
  root.name = name;
  root.add(mesh);
  return root;
}

export async function loadGenericModel(file: File): Promise<LoadedGenericModel> {
  const format = detectAssetFormat(file.name);
  if (!format || format === 'fbx') {
    throw new UserError('This loader only handles non-FBX 3D formats.');
  }

  const { manager, refs } = createManager();
  const warnings: string[] = [];
  let embeddedImages: EmbeddedModelImage[] = [];
  let root: THREE.Object3D;
  let animations: THREE.AnimationClip[] = [];

  try {
    if (format === 'glb' || format === 'gltf') {
      const isGlb = format === 'glb';
      const data: ArrayBuffer | string = isGlb ? await file.arrayBuffer() : await file.text();
      let json: GltfJson;
      let bin: Uint8Array | null = null;

      if (isGlb) {
        ({ json, bin } = parseGlbContainer(data as ArrayBuffer));
      } else {
        try {
          json = JSON.parse(data as string) as GltfJson;
        } catch {
          throw new UserError('This .gltf file is not valid JSON.');
        }
        const externalBuffer = json.buffers?.find(
          (buffer) => buffer.uri && !buffer.uri.startsWith('data:'),
        );
        if (externalBuffer) {
          throw new UserError(
            'This .gltf references an external .bin buffer, which cannot be read from a single uploaded file. Upload the self-contained .glb, or a .gltf with embedded buffers.',
            externalBuffer.uri,
          );
        }
      }

      const buffers = (json.buffers ?? []).map((buffer) =>
        buffer.uri?.startsWith('data:') ? dataUriBytes(buffer.uri).bytes : null,
      );
      embeddedImages = await extractGltfImages(
        file,
        json,
        bin,
        buffers,
        refs,
        warnings,
      );

      const gltf = await parseGltf(new GLTFLoader(manager), data);
      root = gltf.scene;
      animations = gltf.animations ?? [];
      if (!root) throw new UserError('The glTF has no scene.');
    } else if (format === 'obj') {
      const text = await file.text();
      const group = new OBJLoader(manager).parse(text);
      const libraries = (group as unknown as { materialLibraries?: string[] })
        .materialLibraries ?? [];
      for (const library of libraries) refs.add(library);
      warnings.push(
        'OBJ stores only geometry and material-library names. External .mtl files and their textures cannot be extracted from a single .obj upload.',
      );
      root = group;
    } else if (format === 'stl') {
      const geometry = new STLLoader().parse(await file.arrayBuffer());
      root = wrapGeometry(geometry, safeFileName(stripExt(file.name), 'mesh'));
      warnings.push('STL stores geometry only; it has no materials or textures.');
    } else if (format === 'ply') {
      const geometry = new PLYLoader().parse(await file.arrayBuffer());
      root = wrapGeometry(geometry, safeFileName(stripExt(file.name), 'mesh'));
      warnings.push('PLY stores geometry (and optionally vertex colours); it has no texture maps.');
    } else if (format === 'dae') {
      const collada = new ColladaLoader(manager).parse(await file.text(), '');
      if (!collada?.scene) throw new UserError('Collada parsing returned no scene.');
      root = collada.scene;
      animations =
        (collada as unknown as { animations?: THREE.AnimationClip[] }).animations ?? [];
    } else {
      const group = new TDSLoader(manager).parse(await file.arrayBuffer(), '');
      if (!group) throw new UserError('3DS parsing returned no scene.');
      root = group;
      warnings.push(
        '3DS models usually reference textures externally. External images are listed but not fetched.',
      );
    }
  } catch (error) {
    if (error instanceof UserError) throw error;
    throw new UserError(
      `"${file.name}" could not be loaded. The file may be corrupt or use an unsupported feature.`,
      error instanceof Error ? error.message : undefined,
    );
  }

  if (refs.size > 0) {
    warnings.push(
      `${refs.size} external resource reference(s) were found. They are listed in the report but never fetched.`,
    );
  }

  return {
    root,
    format,
    animations,
    externalRefs: [...refs],
    warnings,
    embeddedImages,
  };
}

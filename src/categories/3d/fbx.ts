/**
 * Real FBX asset extraction for the 3D Asset Extractor tool.
 *
 * - Meshes come from three's FBXLoader (actual geometry), exported per object.
 * - Embedded textures are read from the binary FBX "Video" nodes, preserving the
 *   original image bytes. External texture references are listed but not fetched.
 */
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter.js';
import { PLYExporter } from 'three/examples/jsm/exporters/PLYExporter.js';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import { safeFileName } from '../../core/format';
import { canvasToBlob, context2d, createCanvas } from '../../core/image';

export type MeshFormat = 'obj' | 'stl' | 'ply' | 'glb';

export interface ExtractedAsset {
  name: string;
  blob: Blob;
}

export interface EmbeddedImage {
  name: string;
  bytes: Uint8Array;
  mime: string;
}

export interface FbxScan {
  images: EmbeddedImage[];
  references: string[];
  ascii: boolean;
  error?: string;
}

const BINARY_MAGIC = 'Kaydara FBX Binary  \u0000';
const TRANSPARENT_PIXEL =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1' height='1'/%3E";

type FbxProp = string | number | boolean | Uint8Array | number[];

interface FbxNode {
  name: string;
  props: FbxProp[];
  children: FbxNode[];
}

class BinReader {
  offset = 0;

  constructor(private readonly view: DataView) {}

  get size(): number {
    return this.view.byteLength;
  }

  u8(): number {
    return this.view.getUint8(this.offset++);
  }

  i16(): number {
    const value = this.view.getInt16(this.offset, true);
    this.offset += 2;
    return value;
  }

  u32(): number {
    const value = this.view.getUint32(this.offset, true);
    this.offset += 4;
    return value;
  }

  i32(): number {
    const value = this.view.getInt32(this.offset, true);
    this.offset += 4;
    return value;
  }

  f32(): number {
    const value = this.view.getFloat32(this.offset, true);
    this.offset += 4;
    return value;
  }

  f64(): number {
    const value = this.view.getFloat64(this.offset, true);
    this.offset += 8;
    return value;
  }

  u64(): number {
    const low = this.u32();
    const high = this.u32();
    return high * 4294967296 + low;
  }

  skip(length: number): void {
    this.offset += length;
  }

  string(length: number): string {
    const start = this.view.byteOffset + this.offset;
    const bytes = new Uint8Array(this.view.buffer, start, length);
    this.offset += length;
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  }

  raw(length: number): Uint8Array {
    const start = this.view.byteOffset + this.offset;
    const copy = new Uint8Array(this.view.buffer.slice(start, start + length));
    this.offset += length;
    return copy;
  }
}

export function isBinaryFbx(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < BINARY_MAGIC.length) return false;
  const head = new TextDecoder('latin1').decode(new Uint8Array(buffer, 0, BINARY_MAGIC.length));
  return head === BINARY_MAGIC;
}

/** Cheap structural sanity check before doing real work. */
export function isLikelyFbx(buffer: ArrayBuffer): boolean {
  if (isBinaryFbx(buffer)) return true;
  const sample = new TextDecoder('utf-8', { fatal: false }).decode(
    new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 2048)),
  );
  return /FBX/i.test(sample.slice(0, 512));
}

function parseProperty(reader: BinReader): FbxProp {
  const type = reader.string(1);
  switch (type) {
    case 'C':
      return (reader.u8() & 1) === 1;
    case 'Y':
      return reader.i16();
    case 'I':
      return reader.i32();
    case 'F':
      return reader.f32();
    case 'D':
      return reader.f64();
    case 'L':
      return reader.u64();
    case 'S': {
      const length = reader.u32();
      return reader.string(length);
    }
    case 'R': {
      const length = reader.u32();
      return reader.raw(length);
    }
    case 'b':
    case 'c':
    case 'd':
    case 'f':
    case 'i':
    case 'l': {
      const arrayLength = reader.u32();
      const encoding = reader.u32();
      const compressedLength = reader.u32();
      const elementSize = type === 'b' || type === 'c' ? 1 : type === 'i' || type === 'f' ? 4 : 8;
      reader.skip(encoding === 1 ? compressedLength : arrayLength * elementSize);
      return [];
    }
    default:
      throw new Error(`Unsupported FBX property type "${type}"`);
  }
}

function parseNode(reader: BinReader, version: number): FbxNode | null {
  const wide = version >= 7500;
  const endOffset = wide ? reader.u64() : reader.u32();
  const numProperties = wide ? reader.u64() : reader.u32();
  const propertyListLength = wide ? reader.u64() : reader.u32();
  const nameLength = reader.u8();
  const name = reader.string(nameLength);

  if (endOffset === 0) return null;
  if (endOffset > reader.size + 16) throw new Error('Invalid FBX node offset');

  const props: FbxProp[] = [];
  const propertyEnd = reader.offset + propertyListLength;
  for (let i = 0; i < numProperties; i += 1) props.push(parseProperty(reader));
  reader.offset = propertyEnd;

  const children: FbxNode[] = [];
  while (reader.offset < endOffset) {
    if (endOffset - reader.offset < (wide ? 25 : 13)) {
      reader.offset = endOffset;
      break;
    }
    const child = parseNode(reader, version);
    if (!child) {
      reader.offset = endOffset;
      break;
    }
    children.push(child);
  }
  reader.offset = endOffset;
  return { name, props, children };
}

function collectNodes(nodes: FbxNode[], name: string, out: FbxNode[] = []): FbxNode[] {
  for (const node of nodes) {
    if (node.name === name) out.push(node);
    collectNodes(node.children, name, out);
  }
  return out;
}

function detectMime(bytes: Uint8Array): string | null {
  const starts = (...signature: number[]): boolean =>
    signature.every((value, index) => bytes[index] === value);
  if (starts(0x89, 0x50, 0x4e, 0x47)) return 'image/png';
  if (starts(0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (starts(0x47, 0x49, 0x46, 0x38)) return 'image/gif';
  if (starts(0x42, 0x4d)) return 'image/bmp';
  if (starts(0x44, 0x44, 0x53, 0x20)) return 'image/vnd-ms.dds';
  if (starts(0x49, 0x49, 0x2a, 0x00) || starts(0x4d, 0x4d, 0x00, 0x2a)) return 'image/tiff';
  if (
    bytes.length > 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp';
  }
  return null;
}

function extensionFor(mime: string | null, sourceName: string): string {
  switch (mime) {
    case 'image/png':
      return 'png';
    case 'image/jpeg':
      return 'jpg';
    case 'image/gif':
      return 'gif';
    case 'image/bmp':
      return 'bmp';
    case 'image/webp':
      return 'webp';
    case 'image/vnd-ms.dds':
      return 'dds';
    case 'image/tiff':
      return 'tif';
    default: {
      const match = /\.([a-z0-9]{2,5})$/i.exec(sourceName);
      return match ? match[1].toLowerCase() : 'bin';
    }
  }
}

function baseName(value: string): string {
  const normalised = value.replace(/\\/g, '/');
  const part = normalised.slice(normalised.lastIndexOf('/') + 1);
  return part || 'texture';
}

/** Scans the FBX container for embedded images and external texture references. */
export function scanFbxMedia(buffer: ArrayBuffer): FbxScan {
  if (!isBinaryFbx(buffer)) {
    const text = new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(buffer));
    const references = new Set<string>();
    for (const match of text.matchAll(/(?:RelativeFilename|Filename):\s*"([^"]+)"/g)) {
      if (match[1]) references.add(match[1].replace(/\\/g, '/'));
    }
    return { images: [], references: [...references], ascii: true };
  }

  try {
    const view = new DataView(buffer);
    const reader = new BinReader(view);
    reader.skip(23);
    const version = reader.u32();
    if (version < 6400) {
      return { images: [], references: [], ascii: false, error: `Unsupported FBX version ${version}.` };
    }

    const roots: FbxNode[] = [];
    while (reader.offset < view.byteLength - 160) {
      const node = parseNode(reader, version);
      if (!node) break;
      roots.push(node);
    }

    const images: EmbeddedImage[] = [];
    const references = new Set<string>();
    const seen = new Set<string>();

    for (const video of collectNodes(roots, 'Video')) {
      const strings = video.props.filter((prop): prop is string => typeof prop === 'string');
      const relativeNode = video.children.find((child) => child.name === 'RelativeFilename');
      const relative = relativeNode?.props.find(
        (prop): prop is string => typeof prop === 'string' && prop.length > 0,
      );
      const rawName = relative ?? strings[1] ?? strings[0] ?? 'texture';
      const cleanName = baseName(rawName).replace(/^[A-Za-z]+::/, '');

      const contentNode = video.children.find((child) => child.name === 'Content');
      let bytes: Uint8Array | null = null;
      let contentText: string | null = null;
      if (contentNode) {
        for (const prop of contentNode.props) {
          if (prop instanceof Uint8Array && prop.byteLength > 0) {
            bytes = prop;
            break;
          }
          if (typeof prop === 'string' && prop.length > 0) contentText = prop;
        }
      }

      if (!bytes && contentText) {
        const compact = contentText.replace(/\s+/g, '');
        if (compact.length > 100 && /^[A-Za-z0-9+/=]+$/.test(compact)) {
          try {
            const binary = atob(compact);
            const decoded = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i += 1) decoded[i] = binary.charCodeAt(i);
            bytes = decoded;
          } catch {
            /* not base64 after all */
          }
        } else {
          references.add(contentText.replace(/\\/g, '/'));
        }
      }

      if (!bytes) {
        if (relative) references.add(relative.replace(/\\/g, '/'));
        continue;
      }

      const mime = detectMime(bytes) ?? 'application/octet-stream';
      const ext = extensionFor(mime, cleanName);
      const name = `${cleanName.replace(/\.[^.]+$/, '') || 'texture'}.${ext}`;
      const key = `${name}:${bytes.byteLength}`;
      if (seen.has(key)) continue;
      seen.add(key);
      images.push({ name, bytes, mime });
    }

    return { images, references: [...references], ascii: false };
  } catch (error) {
    return {
      images: [],
      references: [],
      ascii: false,
      error: error instanceof Error ? error.message : 'Could not read the FBX container.',
    };
  }
}

/**
 * Creates an FBXLoader that never performs network requests for external texture
 * paths: those URLs are recorded and replaced with a 1×1 transparent pixel.
 */
export function createFbxLoader(): { loader: FBXLoader; externalRefs: Set<string> } {
  const externalRefs = new Set<string>();
  const manager = new THREE.LoadingManager();
  manager.setURLModifier((url) => {
    if (url.startsWith('blob:') || url.startsWith('data:')) return url;
    externalRefs.add(url.replace(/\\/g, '/'));
    return TRANSPARENT_PIXEL;
  });
  return { loader: new FBXLoader(manager), externalRefs };
}

function uniqueName(base: string, extension: string, used: Set<string>): string {
  let candidate = `${base}.${extension}`;
  let counter = 2;
  while (used.has(candidate.toLowerCase())) {
    candidate = `${base}-${counter}.${extension}`;
    counter += 1;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

function cleanMeshName(value: string, fallback: string): string {
  const stripped = value.replace(/^[A-Za-z]+::/, '') || fallback;
  return safeFileName(stripped, fallback).slice(0, 80);
}

/** Exports each mesh object as its own file, baking world transforms into geometry. */
export async function exportMeshes(
  root: THREE.Object3D,
  format: MeshFormat,
  onStep?: (done: number, total: number, name: string) => void,
): Promise<{ assets: ExtractedAsset[]; failures: string[] }> {
  const meshes: THREE.Mesh[] = [];
  root.updateMatrixWorld(true);
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh && mesh.geometry?.getAttribute('position')) meshes.push(mesh);
  });

  const assets: ExtractedAsset[] = [];
  const failures: string[] = [];
  const used = new Set<string>();
  const objExporter = new OBJExporter();
  const stlExporter = new STLExporter();
  const plyExporter = new PLYExporter();
  const gltfExporter = new GLTFExporter();

  for (let index = 0; index < meshes.length; index += 1) {
    const mesh = meshes[index];
    const label = cleanMeshName(mesh.name, `mesh_${String(index + 1).padStart(3, '0')}`);
    let geometry: THREE.BufferGeometry | null = null;
    let material: THREE.MeshStandardMaterial | null = null;

    try {
      geometry = mesh.geometry.clone();
      geometry.applyMatrix4(mesh.matrixWorld);
      geometry.computeBoundingBox();
      material = new THREE.MeshStandardMaterial({ color: 0xbbbbbb, metalness: 0.05, roughness: 0.7 });
      const object = new THREE.Mesh(geometry, material);
      object.name = label;

      if (format === 'obj') {
        const text = objExporter.parse(object);
        assets.push({
          name: uniqueName(label, 'obj', used),
          blob: new Blob([`# ${label}\n${text}`], { type: 'text/plain' }),
        });
      } else if (format === 'stl') {
        const data = stlExporter.parse(object, { binary: true });
        assets.push({
          name: uniqueName(label, 'stl', used),
          blob: new Blob([data as unknown as BlobPart], { type: 'model/stl' }),
        });
      } else if (format === 'ply') {
        const data = await new Promise<string | ArrayBuffer>((resolve, reject) => {
          try {
            plyExporter.parse(object, (result) => resolve(result), { binary: true });
          } catch (error) {
            reject(error instanceof Error ? error : new Error('PLY export failed'));
          }
        });
        assets.push({
          name: uniqueName(label, 'ply', used),
          blob: new Blob([data as BlobPart], { type: 'application/octet-stream' }),
        });
      } else {
        const data = await gltfExporter.parseAsync(object, { binary: true });
        assets.push({
          name: uniqueName(label, 'glb', used),
          blob: new Blob([data as ArrayBuffer], { type: 'model/gltf-binary' }),
        });
      }
    } catch (error) {
      failures.push(`${label}: ${error instanceof Error ? error.message : 'export failed'}`);
    } finally {
      geometry?.dispose();
      material?.dispose();
    }

    onStep?.(index + 1, meshes.length, label);
    // Let the browser paint progress between meshes.
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  return { assets, failures };
}

const MATERIAL_MAP_SLOTS = [
  'map',
  'normalMap',
  'bumpMap',
  'roughnessMap',
  'metalnessMap',
  'emissiveMap',
  'aoMap',
  'alphaMap',
  'specularMap',
  'displacementMap',
  'lightMap',
] as const;

/** Material names plus which map slots are assigned, from the loaded scene. */
export function collectMaterials(root: THREE.Object3D): Array<{ name: string; maps: string[] }> {
  const collected = new Map<string, { name: string; maps: Set<string> }>();
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      if (!material) continue;
      const entry = collected.get(material.uuid) ?? {
        name: material.name || 'Unnamed material',
        maps: new Set<string>(),
      };
      for (const slot of MATERIAL_MAP_SLOTS) {
        if ((material as unknown as Record<string, unknown>)[slot]) entry.maps.add(slot);
      }
      collected.set(material.uuid, entry);
    }
  });
  return [...collected.values()].map((entry) => ({ name: entry.name, maps: [...entry.maps] }));
}

/**
 * Fallback for embedded images the container scan did not decode (for example
 * ASCII FBX base64 content): pulls the images the loader already decoded and
 * re-encodes them as PNG.
 */
export async function extractLoadedMaterialTextures(
  root: THREE.Object3D,
): Promise<{ assets: ExtractedAsset[]; failures: string[] }> {
  const textures = new Map<string, { texture: THREE.Texture; label: string }>();
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      if (!material) continue;
      for (const slot of MATERIAL_MAP_SLOTS) {
        const texture = (material as unknown as Record<string, unknown>)[slot];
        if (texture instanceof THREE.Texture && !textures.has(texture.uuid)) {
          textures.set(texture.uuid, {
            texture,
            label: texture.name || `${material.name || 'material'}_${slot}`,
          });
        }
      }
    }
  });

  const deadline = performance.now() + 2500;
  while (performance.now() < deadline) {
    const pending = [...textures.values()].some(({ texture }) => {
      const image = texture.image as (HTMLImageElement & { complete?: boolean }) | undefined;
      return image && image.complete === false;
    });
    if (!pending) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  const assets: ExtractedAsset[] = [];
  const failures: string[] = [];
  const used = new Set<string>();

  for (const { texture, label } of textures.values()) {
    const image = texture.image as CanvasImageSource & { width?: number; height?: number; naturalWidth?: number; naturalHeight?: number };
    const width = (image as HTMLImageElement).naturalWidth || image?.width || 0;
    const height = (image as HTMLImageElement).naturalHeight || image?.height || 0;
    if (!image || width < 8 || height < 8) continue;
    try {
      const canvas = createCanvas(width, height);
      const ctx = context2d(canvas);
      ctx.drawImage(image, 0, 0, width, height);
      const blob = await canvasToBlob(canvas, 'image/png');
      const base = safeFileName(label.replace(/^[A-Za-z]+::/, ''), 'texture').slice(0, 80);
      assets.push({ name: uniqueName(base, 'png', used), blob });
    } catch (error) {
      failures.push(`${label}: ${error instanceof Error ? error.message : 'texture export failed'}`);
    }
  }

  return { assets, failures };
}

/** Revokes blob URLs the loader created for embedded textures. */
export function revokeLoadedTextureUrls(root: THREE.Object3D): void {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      if (!material) continue;
      for (const value of Object.values(material as unknown as Record<string, unknown>)) {
        if (value instanceof THREE.Texture) {
          const src = (value.image as { src?: string } | undefined)?.src;
          if (src?.startsWith('blob:')) URL.revokeObjectURL(src);
        }
      }
    }
  });
}

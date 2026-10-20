/**
 * Component analysis and material preparation for the FBX component split.
 *
 * Each mesh object is a component. Material slots are preserved per face using
 * geometry.groups, and every exported component receives independent material
 * definitions (duplicated per component) that keep their own texture references.
 */
import * as THREE from 'three';
import { canvasToBlob, context2d, createCanvas } from '../../core/image';
import { safeFileName } from '../../core/format';

export type SplitFormat = 'obj' | 'glb';

export const MATERIAL_SLOTS = [
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

export type MaterialSlot = (typeof MATERIAL_SLOTS)[number];

export interface ComponentInfo {
  id: string;
  name: string;
  vertices: number;
  triangles: number;
  materialNames: string[];
  textureCount: number;
  mesh: THREE.Mesh;
}

export interface TextureAsset {
  key: string;
  name: string;
  blob: Blob;
}

export interface PreparedMaterial {
  name: string;
  originalName: string;
  exportMaterial: THREE.MeshStandardMaterial;
  /** slot -> filename inside textures/ */
  maps: Partial<Record<MaterialSlot, string>>;
  textureObjects: Partial<Record<MaterialSlot, THREE.Texture>>;
  externalMaps: string[];
  faceCount: number;
}

export interface PreparedComponent {
  name: string;
  geometry: THREE.BufferGeometry;
  materials: PreparedMaterial[];
  textures: TextureAsset[];
  externalRefs: string[];
  notes: string[];
  triangles: number;
}

export function safeAssetName(input: string, fallback: string): string {
  const cleaned = safeFileName(input, fallback)
    .replace(/\s+/g, '_')
    .replace(/^[._-]+/, '')
    .replace(/[._-]+$/, '');
  return cleaned.slice(0, 80) || fallback;
}

function uniqueName(base: string, used: Set<string>): string {
  let candidate = base;
  let counter = 2;
  while (used.has(candidate.toLowerCase())) {
    candidate = `${base}_${counter}`;
    counter += 1;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

export function analyzeComponents(root: THREE.Object3D): ComponentInfo[] {
  root.updateMatrixWorld(true);
  const components: ComponentInfo[] = [];
  const usedNames = new Set<string>();

  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry?.getAttribute('position')) return;
    const count = mesh.geometry.getIndex()?.count ?? mesh.geometry.getAttribute('position').count;
    const triangles = Math.floor(count / 3);
    if (triangles <= 0) return;

    const name = uniqueName(
      safeAssetName(mesh.name || `Object_${components.length + 1}`, `Object_${components.length + 1}`),
      usedNames,
    );
    const materials = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).filter(
      (material): material is THREE.Material => Boolean(material),
    );
    const textureIds = new Set<string>();
    for (const material of materials) {
      for (const slot of MATERIAL_SLOTS) {
        const texture = (material as unknown as Record<string, unknown>)[slot];
        if (texture instanceof THREE.Texture) textureIds.add(texture.uuid);
      }
    }

    components.push({
      id: mesh.uuid,
      name,
      vertices: mesh.geometry.getAttribute('position').count,
      triangles,
      materialNames: materials.map((material, index) => material.name || `Material${index + 1}`),
      textureCount: textureIds.size,
      mesh,
    });
  });

  return components;
}

function textureImageSize(texture: THREE.Texture): { width: number; height: number } {
  const image = texture.image as
    | (HTMLImageElement & { width?: number; height?: number; naturalWidth?: number; naturalHeight?: number })
    | ImageBitmap
    | HTMLCanvasElement
    | undefined;
  if (!image) return { width: 0, height: 0 };
  return {
    width: (image as HTMLImageElement).naturalWidth || image.width || 0,
    height: (image as HTMLImageElement).naturalHeight || image.height || 0,
  };
}

function extensionForMime(mime: string): string {
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('gif')) return 'gif';
  if (mime.includes('bmp')) return 'bmp';
  if (mime.includes('tiff')) return 'tif';
  if (mime.includes('dds')) return 'dds';
  if (mime.includes('tga')) return 'tga';
  return 'png';
}

async function extractTexture(
  texture: THREE.Texture,
  fallbackName: string,
  used: Set<string>,
): Promise<TextureAsset | null> {
  const { width, height } = textureImageSize(texture);
  if (width < 8 || height < 8) return null;

  const image = texture.image as (HTMLImageElement & { src?: string }) | undefined;
  const src = image?.src;
  let blob: Blob | null = null;
  let extension = 'png';

  if (src && /^(blob:|data:)/.test(src)) {
    try {
      const response = await fetch(src);
      const fetched = await response.blob();
      if (fetched.size > 64 && fetched.type.startsWith('image/')) {
        blob = fetched;
        extension = extensionForMime(fetched.type);
      }
    } catch {
      /* fall back to re-encoding from the decoded image */
    }
  }

  if (!blob) {
    try {
      const canvas = createCanvas(width, height);
      context2d(canvas).drawImage(image as CanvasImageSource, 0, 0, width, height);
      blob = await canvasToBlob(canvas, 'image/png');
      extension = 'png';
    } catch {
      return null;
    }
  }

  const rawName = (texture.name || fallbackName).replace(/^[A-Za-z]+::/, '');
  const base = safeAssetName(rawName.replace(/\.[^.]+$/, '') || fallbackName, fallbackName);
  const name = uniqueName(`${base}.${extension}`, used);
  return { key: texture.uuid, name, blob };
}

/** Waits for loader-decoded embedded textures so images are drawable. */
export async function waitForComponentTextures(
  root: THREE.Object3D,
  timeoutMs = 4000,
): Promise<void> {
  const textures: THREE.Texture[] = [];
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      if (!material) continue;
      for (const slot of MATERIAL_SLOTS) {
        const texture = (material as unknown as Record<string, unknown>)[slot];
        if (texture instanceof THREE.Texture) textures.push(texture);
      }
    }
  });

  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    const pending = textures.some((texture) => {
      const image = texture.image as { complete?: boolean } | undefined;
      return Boolean(image && image.complete === false);
    });
    if (!pending) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

function slotForFace(geometry: THREE.BufferGeometry, bufferOffset: number): number {
  const groups = geometry.groups;
  if (!groups.length) return 0;
  for (const group of groups) {
    if (bufferOffset >= group.start && bufferOffset < group.start + group.count) {
      return group.materialIndex ?? 0;
    }
  }
  return 0;
}

function toStandardMaterial(source: THREE.Material | null): THREE.MeshStandardMaterial {
  if (!source) return new THREE.MeshStandardMaterial({ color: 0xbbbbbb, roughness: 0.7, metalness: 0.05 });
  if ((source as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
    return (source as THREE.MeshStandardMaterial).clone();
  }
  const anySource = source as unknown as {
    color?: THREE.Color;
    emissive?: THREE.Color;
    emissiveIntensity?: number;
    opacity?: number;
    transparent?: boolean;
    side?: THREE.Side;
    map?: THREE.Texture | null;
    normalMap?: THREE.Texture | null;
    bumpMap?: THREE.Texture | null;
    roughnessMap?: THREE.Texture | null;
    metalnessMap?: THREE.Texture | null;
    aoMap?: THREE.Texture | null;
    emissiveMap?: THREE.Texture | null;
    alphaMap?: THREE.Texture | null;
    specularMap?: THREE.Texture | null;
    displacementMap?: THREE.Texture | null;
    lightMap?: THREE.Texture | null;
    shininess?: number;
    roughness?: number;
    metalness?: number;
    normalScale?: THREE.Vector2;
  };
  return new THREE.MeshStandardMaterial({
    color: anySource.color ?? new THREE.Color(0xbbbbbb),
    emissive: anySource.emissive ?? new THREE.Color(0x000000),
    emissiveIntensity: anySource.emissiveIntensity ?? 1,
    opacity: anySource.opacity ?? 1,
    transparent: anySource.transparent ?? false,
    side: anySource.side ?? THREE.FrontSide,
    map: anySource.map ?? null,
    normalMap: anySource.normalMap ?? anySource.bumpMap ?? null,
    roughnessMap: anySource.roughnessMap ?? null,
    metalnessMap: anySource.metalnessMap ?? null,
    aoMap: anySource.aoMap ?? null,
    emissiveMap: anySource.emissiveMap ?? null,
    alphaMap: anySource.alphaMap ?? null,
    displacementMap: anySource.displacementMap ?? null,
    lightMap: anySource.lightMap ?? null,
    roughness:
      typeof anySource.roughness === 'number'
        ? anySource.roughness
        : typeof anySource.shininess === 'number'
          ? Math.min(1, Math.max(0.05, 1 - Math.sqrt(anySource.shininess / 128)))
          : 0.6,
    metalness: anySource.metalness ?? 0,
  });
}

export async function prepareComponent(
  mesh: THREE.Mesh,
  componentName: string,
  externalRefs: string[],
  materialNamesUsed: Set<string>,
  textureNamesUsed: Set<string>,
): Promise<PreparedComponent> {
  const geometry = mesh.geometry.clone();
  geometry.applyMatrix4(mesh.matrixWorld);
  if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();

  const sourceMaterials = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).filter(
    (material): material is THREE.Material => Boolean(material),
  );
  const slots = sourceMaterials.length ? sourceMaterials : [null];

  const textures = new Map<string, TextureAsset>();
  const materials: PreparedMaterial[] = [];
  const external = new Set(externalRefs);

  for (let index = 0; index < slots.length; index += 1) {
    const source = slots[index];
    const originalName = source?.name?.trim() || `Material${index + 1}`;
    const name = uniqueName(
      `${componentName}_${safeAssetName(originalName, `Material${index + 1}`)}`,
      materialNamesUsed,
    );
    const exportMaterial = toStandardMaterial(source);
    exportMaterial.name = name;

    const maps: Partial<Record<MaterialSlot, string>> = {};
    const textureObjects: Partial<Record<MaterialSlot, THREE.Texture>> = {};
    const externalMaps: string[] = [];

    for (const slot of MATERIAL_SLOTS) {
      const texture = (source as unknown as Record<string, unknown> | null)?.[slot];
      if (!(texture instanceof THREE.Texture)) continue;
      let asset = textures.get(texture.uuid);
      if (!asset) {
        asset = (await extractTexture(texture, `${name}_${slot}`, textureNamesUsed)) ?? undefined;
        if (asset) textures.set(texture.uuid, asset);
      }
      if (asset && asset.name) {
        maps[slot] = asset.name;
        textureObjects[slot] = texture;
      } else {
        externalMaps.push(`${slot}: ${texture.name || 'unresolved texture'}`);
        const record = exportMaterial as unknown as Record<string, unknown>;
        if (record[slot] instanceof THREE.Texture) record[slot] = null;
      }
    }

    materials.push({
      name,
      originalName,
      exportMaterial,
      maps,
      textureObjects,
      externalMaps,
      faceCount: 0,
    });
    for (const item of externalMaps) external.add(`${componentName} / ${item}`);
  }

  const triangles = Math.floor(
    (geometry.getIndex()?.count ?? geometry.getAttribute('position').count) / 3,
  );
  for (let triangle = 0; triangle < triangles; triangle += 1) {
    const slot = slotForFace(geometry, triangle * 3);
    const target = materials[Math.min(Math.max(0, slot), materials.length - 1)];
    if (target) target.faceCount += 1;
  }

  const notes: string[] = [];
  if (geometry.getAttribute('tangent')) {
    notes.push('Tangents are kept in GLB; OBJ cannot store tangents.');
  }
  if (geometry.getAttribute('uv1')) notes.push('Only the first UV set is used.');
  if (geometry.getAttribute('skinIndex')) {
    notes.push('Skinned components are exported in their current pose; skeleton and animation are not included.');
  }
  if (Object.keys(geometry.morphAttributes ?? {}).length) {
    notes.push('Morph target animation is not included.');
  }

  return {
    name: componentName,
    geometry,
    materials,
    textures: [...textures.values()],
    externalRefs: [...external],
    notes,
    triangles,
  };
}

export function slotForFaceIndex(geometry: THREE.BufferGeometry, triangleIndex: number): number {
  return slotForFace(geometry, triangleIndex * 3);
}

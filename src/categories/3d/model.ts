/** Shared three.js model loading and statistics helpers for the 3D tools. */
import * as THREE from 'three';
import { ColladaLoader } from 'three/examples/jsm/loaders/ColladaLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { TDSLoader } from 'three/examples/jsm/loaders/TDSLoader.js';
import { UserError } from '../../core/errors';

export type ModelFormat = 'glb' | 'gltf' | 'fbx' | 'obj' | 'stl' | 'ply' | 'dae' | '3ds';

const FORMATS: readonly ModelFormat[] = ['glb', 'gltf', 'fbx', 'obj', 'stl', 'ply', 'dae', '3ds'];

export function detectFormat(fileName: string): ModelFormat | null {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  return (FORMATS as readonly string[]).includes(ext) ? (ext as ModelFormat) : null;
}

export const MODEL_ACCEPT = '.glb,.gltf,.fbx,.obj,.stl,.ply,.dae,.3ds';

export interface LoadedModel {
  root: THREE.Object3D;
  format: ModelFormat;
  animations: THREE.AnimationClip[];
  /** Releases every geometry, material and texture owned by this model. */
  dispose: () => void;
}

function disposeMaterial(material: THREE.Material): void {
  const record = material as unknown as Record<string, unknown>;
  for (const value of Object.values(record)) {
    if (value instanceof THREE.Texture) value.dispose();
  }
  material.dispose();
}

export function disposeObject(root: THREE.Object3D): void {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    if (mesh.material) {
      if (Array.isArray(mesh.material)) mesh.material.forEach(disposeMaterial);
      else disposeMaterial(mesh.material);
    }
  });
}

function parseGltf(data: ArrayBuffer | string): Promise<GLTF> {
  return new Promise((resolve, reject) => {
    new GLTFLoader().parse(
      data,
      '',
      resolve,
      (error: unknown) => reject(new Error(error instanceof Error ? error.message : 'glTF parsing failed')),
    );
  });
}

function wrapGeometry(geometry: THREE.BufferGeometry): THREE.Group {
  if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({ color: 0xb9bec8, metalness: 0.05, roughness: 0.6 });
  const root = new THREE.Group();
  root.add(new THREE.Mesh(geometry, material));
  return root;
}

export async function loadModelFile(file: File): Promise<LoadedModel> {
  const format = detectFormat(file.name);
  if (!format) {
    throw new UserError(
      `"${file.name}" is not a supported 3D format.`,
      'Supported: GLB, GLTF, FBX, OBJ, STL, PLY, DAE, 3DS.',
    );
  }

  try {
    if (format === 'glb' || format === 'gltf') {
      const data = format === 'glb' ? await file.arrayBuffer() : await file.text();
      const gltf = await parseGltf(data);
      return {
        root: gltf.scene,
        format,
        animations: gltf.animations ?? [],
        dispose: () => disposeObject(gltf.scene),
      };
    }
    if (format === 'fbx') {
      const group = new FBXLoader().parse(await file.arrayBuffer(), '');
      return {
        root: group,
        format,
        animations: group.animations ?? [],
        dispose: () => disposeObject(group),
      };
    }
    if (format === 'obj') {
      const group = new OBJLoader().parse(await file.text());
      return { root: group, format, animations: [], dispose: () => disposeObject(group) };
    }
    if (format === 'stl') {
      const root = wrapGeometry(new STLLoader().parse(await file.arrayBuffer()));
      return { root, format, animations: [], dispose: () => disposeObject(root) };
    }
    if (format === 'ply') {
      const root = wrapGeometry(new PLYLoader().parse(await file.arrayBuffer()));
      return { root, format, animations: [], dispose: () => disposeObject(root) };
    }
    if (format === '3ds') {
      const manager = new THREE.LoadingManager();
      manager.setURLModifier((url) =>
        /^(data:|blob:)/.test(url)
          ? url
          : 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=',
      );
      const group = new TDSLoader(manager).parse(await file.arrayBuffer(), '');
      return {
        root: group,
        format,
        animations: [],
        dispose: () => disposeObject(group),
      };
    }

    const collada = new ColladaLoader().parse(await file.text(), '');
    if (!collada) throw new Error('Collada parsing returned no scene');
    const animations =
      (collada as unknown as { animations?: THREE.AnimationClip[] }).animations ?? [];
    return {
      root: collada.scene,
      format,
      animations,
      dispose: () => disposeObject(collada.scene),
    };
  } catch (error) {
    if (error instanceof UserError) throw error;
    throw new UserError(
      `"${file.name}" could not be loaded. The file may be corrupt or use an unsupported feature.`,
      error instanceof Error ? error.message : undefined,
    );
  }
}

export interface ModelStats {
  vertices: number;
  triangles: number;
  meshes: number;
  materials: number;
  textures: number;
  bones: number;
  animations: number;
  size: { x: number; y: number; z: number };
}

export function collectStats(root: THREE.Object3D, animations: THREE.AnimationClip[]): ModelStats {
  let vertices = 0;
  let triangles = 0;
  let meshes = 0;
  let bones = 0;
  const materials = new Set<string>();
  const textures = new Set<string>();

  root.traverse((object) => {
    if (object.type === 'Bone') bones += 1;
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    meshes += 1;
    const geometry = mesh.geometry;
    const position = geometry.getAttribute('position');
    if (position) vertices += position.count;
    const index = geometry.getIndex();
    triangles += index ? index.count / 3 : position ? position.count / 3 : 0;

    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of list) {
      if (!material) continue;
      materials.add(material.uuid);
      const record = material as unknown as Record<string, unknown>;
      for (const value of Object.values(record)) {
        if (value instanceof THREE.Texture) textures.add(value.uuid);
      }
    }
  });

  const box = new THREE.Box3().setFromObject(root);
  const size = box.isEmpty() ? new THREE.Vector3() : box.getSize(new THREE.Vector3());

  return {
    vertices: Math.round(vertices),
    triangles: Math.round(triangles),
    meshes,
    materials: materials.size,
    textures: textures.size,
    bones,
    animations: animations.length,
    size: { x: size.x, y: size.y, z: size.z },
  };
}

/** Frames the camera around an object and returns its bounding size. */
export function frameObject(
  object: THREE.Object3D,
  camera: THREE.PerspectiveCamera,
): { size: THREE.Vector3; center: THREE.Vector3 } {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.isEmpty() ? new THREE.Vector3(1, 1, 1) : box.getSize(new THREE.Vector3());
  const center = box.isEmpty() ? new THREE.Vector3() : box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  camera.near = Math.max(0.001, maxDim / 500);
  camera.far = maxDim * 100;
  camera.position.set(0, 0, maxDim * 2.2);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  return { size, center };
}

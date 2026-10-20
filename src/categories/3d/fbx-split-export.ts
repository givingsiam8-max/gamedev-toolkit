/**
 * Package writers for the FBX component split.
 * Produces either OBJ + MTL + textures, or a GLB with embedded textures.
 * Every component gets independent material definitions.
 */
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import {
  MATERIAL_SLOTS,
  safeAssetName,
  slotForFaceIndex,
  type MaterialSlot,
  type PreparedComponent,
  type PreparedMaterial,
  type SplitFormat,
} from './fbx-split';

export interface ComponentFile {
  path: string;
  data: Blob;
}

export interface ComponentExport {
  componentName: string;
  format: SplitFormat;
  meshFile: string;
  materialNames: string[];
  textureFiles: string[];
  files: ComponentFile[];
  report: string;
  notes: string[];
  externalRefs: string[];
}

const fmt = (value: number): string => {
  if (!Number.isFinite(value)) return '0';
  const rounded = Math.round(value * 1e6) / 1e6;
  return Object.is(rounded, -0) ? '0' : String(rounded);
};

const mtlMapLine: Partial<Record<MaterialSlot, string>> = {
  map: 'map_Kd',
  normalMap: 'map_Bump',
  bumpMap: 'map_Bump',
  alphaMap: 'map_d',
  specularMap: 'map_Ks',
};

function buildMtl(prepared: PreparedComponent): string {
  const lines: string[] = ['# GameDev Toolkit — independent component materials', ''];

  for (const material of prepared.materials) {
    const source = material.exportMaterial;
    lines.push(`# ${material.faceCount} face(s) use this material`);
    lines.push(`newmtl ${material.name}`);
    lines.push('Ka 0.000000 0.000000 0.000000');
    lines.push(`Kd ${fmt(source.color.r)} ${fmt(source.color.g)} ${fmt(source.color.b)}`);
    lines.push('Ks 0.200000 0.200000 0.200000');
    lines.push(`Ns ${fmt((1 - source.roughness) ** 2 * 128 + 2)}`);
    lines.push(`d ${fmt(source.opacity)}`);
    lines.push(
      `Ke ${fmt(source.emissive.r * source.emissiveIntensity)} ${fmt(source.emissive.g * source.emissiveIntensity)} ${fmt(source.emissive.b * source.emissiveIntensity)}`,
    );
    lines.push('illum 2');

    for (const slot of MATERIAL_SLOTS) {
      const file = material.maps[slot];
      if (!file) continue;
      const reference = `textures/${file}`;
      const keyword = mtlMapLine[slot];
      if (keyword) lines.push(`${keyword} ${reference}`);
      else lines.push(`# gdt_${slot} ${reference}`);
    }
    if (material.externalMaps.length) {
      for (const external of material.externalMaps) lines.push(`# external: ${external}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function buildObj(prepared: PreparedComponent, mtlFileName: string): string {
  const geometry = prepared.geometry;
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const uv = geometry.getAttribute('uv');
  const index = geometry.getIndex();
  const triangles = Math.floor((index?.count ?? position.count) / 3);

  const lines: string[] = [
    `# GameDev Toolkit — ${prepared.name}`,
    `mtllib ${mtlFileName}`,
    `o ${prepared.name}`,
  ];

  for (let i = 0; i < position.count; i += 1) {
    lines.push(`v ${fmt(position.getX(i))} ${fmt(position.getY(i))} ${fmt(position.getZ(i))}`);
  }
  if (uv) {
    for (let i = 0; i < uv.count; i += 1) {
      lines.push(`vt ${fmt(uv.getX(i))} ${fmt(uv.getY(i))}`);
    }
  }
  if (normal) {
    for (let i = 0; i < normal.count; i += 1) {
      lines.push(`vn ${fmt(normal.getX(i))} ${fmt(normal.getY(i))} ${fmt(normal.getZ(i))}`);
    }
  }

  const faceIndex = (vertex: number, hasUv: boolean, hasNormal: boolean): string => {
    const v = vertex + 1;
    if (hasUv && hasNormal) return `${v}/${v}/${v}`;
    if (hasUv) return `${v}/${v}`;
    if (hasNormal) return `${v}//${v}`;
    return `${v}`;
  };

  let currentMaterial = -1;
  for (let triangle = 0; triangle < triangles; triangle += 1) {
    const base = triangle * 3;
    const a = index ? index.getX(base) : base;
    const b = index ? index.getX(base + 1) : base + 1;
    const c = index ? index.getX(base + 2) : base + 2;
    const slot = Math.min(
      Math.max(0, slotForFaceIndex(geometry, triangle)),
      prepared.materials.length - 1,
    );
    if (slot !== currentMaterial) {
      lines.push(`usemtl ${prepared.materials[slot].name}`);
      currentMaterial = slot;
    }
    lines.push(
      `f ${faceIndex(a, Boolean(uv), Boolean(normal))} ${faceIndex(b, Boolean(uv), Boolean(normal))} ${faceIndex(c, Boolean(uv), Boolean(normal))}`,
    );
  }

  return lines.join('\n');
}

function buildReport(prepared: PreparedComponent, format: SplitFormat): string {
  const materialReport = prepared.materials.map((material: PreparedMaterial) => ({
    name: material.name,
    originalName: material.originalName,
    faces: material.faceCount,
    maps: Object.fromEntries(
      Object.entries(material.maps)
        .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
        .map(([slot, file]) => [slot, `textures/${file}`]),
    ),
    externalMaps: material.externalMaps,
    pbr: {
      metallic: material.exportMaterial.metalness,
      roughness: material.exportMaterial.roughness,
      opacity: material.exportMaterial.opacity,
    },
  }));

  const notes = [...prepared.notes];
  notes.push(
    format === 'obj'
      ? 'MTL supports base colour, normal/bump, alpha and specular maps. Roughness, metallic, AO and emission maps are included as files and comments because MTL has no standard slots for them.'
      : 'GLB embeds materials and textures; the textures/ folder is a convenience copy.',
  );
  notes.push('Every material in this package is an independent definition, even when the source FBX shared it.');

  return JSON.stringify(
    {
      component: prepared.name,
      format,
      triangles: prepared.triangles,
      materials: materialReport,
      textures: prepared.textures.map((texture) => ({
        file: `textures/${texture.name}`,
        bytes: texture.blob.size,
      })),
      externalReferences: prepared.externalRefs,
      notes,
    },
    null,
    2,
  );
}

function textureFiles(prepared: PreparedComponent): ComponentFile[] {
  return prepared.textures.map((texture) => ({
    path: `textures/${texture.name}`,
    data: texture.blob,
  }));
}

async function buildGlb(prepared: PreparedComponent): Promise<Blob> {
  if (
    prepared.materials.some((material) => material.maps.aoMap) &&
    !prepared.geometry.getAttribute('uv1')
  ) {
    const uv = prepared.geometry.getAttribute('uv');
    if (uv) prepared.geometry.setAttribute('uv1', uv.clone());
  }

  const clonedMaterials: THREE.Material[] = prepared.materials.map((material) => {
    const clone = material.exportMaterial.clone();
    clone.name = material.name;
    for (const slot of MATERIAL_SLOTS) {
      const record = clone as unknown as Record<string, unknown>;
      const texture = material.textureObjects[slot];
      if (texture) record[slot] = texture;
      else if (record[slot] instanceof THREE.Texture) record[slot] = null;
    }
    return clone;
  });

  const mesh = new THREE.Mesh(prepared.geometry, clonedMaterials);
  mesh.name = prepared.name;

  // The exporter skips a multi-material mesh that has no groups. Components
  // without a material layer need one explicit group; invalid indices fall back
  // to the first material.
  const drawCount =
    prepared.geometry.getIndex()?.count ?? prepared.geometry.getAttribute('position').count;
  if (prepared.geometry.groups.length === 0) {
    prepared.geometry.addGroup(0, drawCount, 0);
  } else {
    for (const group of prepared.geometry.groups) {
      if (!clonedMaterials[group.materialIndex ?? 0]) group.materialIndex = 0;
    }
  }
  const group = new THREE.Group();
  group.name = prepared.name;
  group.add(mesh);

  try {
    const result = await new GLTFExporter().parseAsync(group, { binary: true });
    return new Blob([result as ArrayBuffer], { type: 'model/gltf-binary' });
  } finally {
    for (const material of clonedMaterials) material.dispose();
  }
}

export async function exportComponentPackage(
  prepared: PreparedComponent,
  format: SplitFormat,
): Promise<ComponentExport> {
  const componentName = safeAssetName(prepared.name, 'Component');
  const textures = textureFiles(prepared);
  const report = buildReport(prepared, format);

  if (format === 'glb') {
    const glb = await buildGlb(prepared);
    const files: ComponentFile[] = [
      { path: `${componentName}.glb`, data: glb },
      ...textures,
      {
        path: 'materials.json',
        data: new Blob([report], { type: 'application/json' }),
      },
    ];
    return {
      componentName,
      format,
      meshFile: `${componentName}.glb`,
      materialNames: prepared.materials.map((material) => material.name),
      textureFiles: prepared.textures.map((texture) => texture.name),
      files,
      report,
      notes: prepared.notes,
      externalRefs: prepared.externalRefs,
    };
  }

  const obj = buildObj(prepared, `${componentName}.mtl`);
  const mtl = buildMtl(prepared);
  const files: ComponentFile[] = [
    { path: `${componentName}.obj`, data: new Blob([obj], { type: 'text/plain' }) },
    { path: `${componentName}.mtl`, data: new Blob([mtl], { type: 'text/plain' }) },
    ...textures,
    {
      path: 'materials.json',
      data: new Blob([report], { type: 'application/json' }),
    },
  ];

  return {
    componentName,
    format,
    meshFile: `${componentName}.obj`,
    materialNames: prepared.materials.map((material) => material.name),
    textureFiles: prepared.textures.map((texture) => texture.name),
    files,
    report,
    notes: prepared.notes,
    externalRefs: prepared.externalRefs,
  };
}

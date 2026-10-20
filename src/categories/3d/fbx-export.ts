/**
 * Minimal ASCII FBX 7.4 writer for static meshes.
 *
 * three.js has no FBX exporter, so this writes the real ASCII FBX structure
 * (header, definitions, geometry, models, materials, connections). World
 * transforms are baked into vertices. Skinning, morph targets, animation and
 * texture embedding are intentionally not emitted.
 */
import * as THREE from 'three';
import { UserError } from '../../core/errors';

export interface FbxExportOptions {
  onProgress?: (done: number, total: number, name: string) => void;
}

interface MeshPlan {
  mesh: THREE.Mesh;
  name: string;
  triangles: number;
}

interface MaterialInfo {
  id: number;
  name: string;
  color: THREE.Color;
  emissive: THREE.Color;
  opacity: number;
  shininess: number;
  doubleSided: boolean;
}

const fmt = (value: number): string => {
  if (!Number.isFinite(value)) return '0';
  const rounded = Math.round(value * 1e6) / 1e6;
  return Object.is(rounded, -0) ? '0' : String(rounded);
};

const cleanName = (value: string, fallback: string): string => {
  const cleaned = value.replace(/["\r\n\t]/g, ' ').replace(/::/g, '_').trim();
  return (cleaned || fallback).slice(0, 80);
};

const colorOf = (material: THREE.Material, key: string, fallback: string): THREE.Color => {
  const value = (material as unknown as Record<string, unknown>)[key];
  return value instanceof THREE.Color ? value : new THREE.Color(fallback);
};

const firstMaterial = (mesh: THREE.Mesh): THREE.Material | null => {
  const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  return material ?? null;
};

const yieldToUi = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

export async function exportAsciiFbx(
  root: THREE.Object3D,
  options: FbxExportOptions = {},
): Promise<string> {
  root.updateMatrixWorld(true);

  const plans: MeshPlan[] = [];
  const usedNames = new Set<string>();

  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const geometry = mesh.geometry;
    if (!geometry?.getAttribute('position')) return;
    const count = geometry.getIndex()?.count ?? geometry.getAttribute('position').count;
    const triangles = Math.floor(count / 3);
    if (triangles <= 0) return;
    const base = cleanName(mesh.name, `Mesh_${plans.length + 1}`);
    let name = base;
    let suffix = 2;
    while (usedNames.has(name.toLowerCase())) {
      name = `${base}_${suffix}`;
      suffix += 1;
    }
    usedNames.add(name.toLowerCase());
    plans.push({ mesh, name, triangles });
  });

  if (!plans.length) {
    throw new UserError('This scene has no renderable triangle meshes to export.');
  }

  const materials = new Map<string, MaterialInfo>();
  let nextMaterialId = 300000;
  const defaultMaterial: MaterialInfo = {
    id: nextMaterialId++,
    name: 'DefaultMaterial',
    color: new THREE.Color(0xb8b8c0),
    emissive: new THREE.Color(0x000000),
    opacity: 1,
    shininess: 20,
    doubleSided: false,
  };

  const materialFor = (mesh: THREE.Mesh): MaterialInfo => {
    const material = firstMaterial(mesh);
    if (!material) return defaultMaterial;
    const existing = materials.get(material.uuid);
    if (existing) return existing;
    const standard = material as THREE.MeshStandardMaterial;
    const info: MaterialInfo = {
      id: nextMaterialId++,
      name: cleanName(material.name, `Material_${materials.size + 1}`),
      color: colorOf(material, 'color', '#b8b8c0'),
      emissive: colorOf(material, 'emissive', '#000000'),
      opacity: typeof material.opacity === 'number' ? material.opacity : 1,
      shininess:
        typeof standard.roughness === 'number'
          ? Math.max(2, (1 - standard.roughness) ** 2 * 128 + 2)
          : 20,
      doubleSided: material.side === THREE.DoubleSide,
    };
    materials.set(material.uuid, info);
    return info;
  };

  for (const plan of plans) materialFor(plan.mesh);

  const geometryIds = plans.map((_, index) => 100000 + index);
  const modelIds = plans.map((_, index) => 200000 + index);
  const materialList = [...materials.values(), defaultMaterial];

  const out: string[] = [];
  const line = (indent: number, text: string): void => {
    out.push(`${'\t'.repeat(indent)}${text}`);
  };
  const property = (indent: number, name: string, type: string, values: string): void => {
    line(indent, `P: "${name}", "${type}", "", "A",${values}`);
  };
  const arrayNode = (indent: number, name: string, values: string, count: number): void => {
    line(indent, `${name}: *${count} {`);
    line(indent + 1, `a: ${values}`);
    line(indent, '}');
  };

  const now = new Date();
  out.push('; FBX 7.4.0 project file');
  out.push('; Created by GameDev Toolkit');
  out.push('; ----------------------------------------------------');
  line(0, 'FBXHeaderExtension:  {');
  line(1, 'FBXHeaderVersion: 1003');
  line(1, 'FBXVersion: 7400');
  line(1, 'CreationTimeStamp:  {');
  line(2, 'Version: 1000');
  line(2, `Year: ${now.getUTCFullYear()}`);
  line(2, `Month: ${now.getUTCMonth() + 1}`);
  line(2, `Day: ${now.getUTCDate()}`);
  line(2, `Hour: ${now.getUTCHours()}`);
  line(2, `Minute: ${now.getUTCMinutes()}`);
  line(2, `Second: ${now.getUTCSeconds()}`);
  line(2, 'Millisecond: 0');
  line(1, '}');
  line(1, 'Creator: "GameDev Toolkit"');
  line(0, '}');

  line(0, 'GlobalSettings:  {');
  line(1, 'Version: 1000');
  line(1, 'Properties70:  {');
  property(2, 'UpAxis', 'int', '1');
  property(2, 'UpAxisSign', 'int', '1');
  property(2, 'FrontAxis', 'int', '2');
  property(2, 'FrontAxisSign', 'int', '1');
  property(2, 'CoordAxis', 'int', '0');
  property(2, 'CoordAxisSign', 'int', '1');
  property(2, 'UnitScaleFactor', 'double', '1');
  line(1, '}');
  line(0, '}');

  line(0, 'Definitions:  {');
  line(1, 'Version: 100');
  line(1, `Count: ${1 + plans.length + plans.length + materialList.length}`);
  line(1, 'ObjectType: "GlobalSettings" {');
  line(2, 'Count: 1');
  line(1, '}');
  line(1, 'ObjectType: "Geometry" {');
  line(2, `Count: ${plans.length}`);
  line(1, '}');
  line(1, 'ObjectType: "Model" {');
  line(2, `Count: ${plans.length}`);
  line(1, '}');
  line(1, 'ObjectType: "Material" {');
  line(2, `Count: ${materialList.length}`);
  line(1, '}');
  line(0, '}');

  line(0, 'Objects:  {');
  const connections: string[] = [];

  for (let index = 0; index < plans.length; index += 1) {
    const plan = plans[index];
    const source = plan.mesh.geometry;
    const geometry = source.clone();
    const geometryId = geometryIds[index];
    const modelId = modelIds[index];
    const materialId = materialFor(plan.mesh).id;

    try {
      geometry.applyMatrix4(plan.mesh.matrixWorld);
      if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();

      const position = geometry.getAttribute('position');
      const normal = geometry.getAttribute('normal');
      const uv = geometry.getAttribute('uv');
      const indexAttribute = geometry.getIndex();
      const vertexCount = position.count;
      const triangleCount = plan.triangles;

      const vertices: string[] = [];
      for (let i = 0; i < vertexCount; i += 1) {
        vertices.push(fmt(position.getX(i)), fmt(position.getY(i)), fmt(position.getZ(i)));
      }

      const loopIndices: number[] = [];
      const polygonIndices: string[] = [];
      for (let triangle = 0; triangle < triangleCount; triangle += 1) {
        const base = triangle * 3;
        const a = indexAttribute ? indexAttribute.getX(base) : base;
        const b = indexAttribute ? indexAttribute.getX(base + 1) : base + 1;
        const c = indexAttribute ? indexAttribute.getX(base + 2) : base + 2;
        loopIndices.push(a, b, c);
        polygonIndices.push(String(a), String(b), String(-c - 1));
      }

      const normals: string[] = [];
      for (const vertexIndex of loopIndices) {
        if (normal) {
          normals.push(fmt(normal.getX(vertexIndex)), fmt(normal.getY(vertexIndex)), fmt(normal.getZ(vertexIndex)));
        } else {
          normals.push('0', '0', '1');
        }
      }

      const uvs: string[] = [];
      if (uv) {
        for (const vertexIndex of loopIndices) {
          uvs.push(fmt(uv.getX(vertexIndex)), fmt(uv.getY(vertexIndex)));
        }
      }

      line(1, `Geometry: ${geometryId}, "Geometry::${plan.name}", "Mesh" {`);
      line(2, 'GeometryVersion: 124');
      arrayNode(2, 'Vertices', vertices.join(','), vertexCount * 3);
      arrayNode(2, 'PolygonVertexIndex', polygonIndices.join(','), triangleCount * 3);
      line(2, 'LayerElementNormal: 0 {');
      line(3, 'Version: 101');
      line(3, 'Name: ""');
      line(3, 'MappingInformationType: "ByPolygonVertex"');
      line(3, 'ReferenceInformationType: "Direct"');
      arrayNode(3, 'Normals', normals.join(','), triangleCount * 3 * 3);
      line(2, '}');
      if (uv) {
        line(2, 'LayerElementUV: 0 {');
        line(3, 'Version: 101');
        line(3, 'Name: "UVChannel_1"');
        line(3, 'MappingInformationType: "ByPolygonVertex"');
        line(3, 'ReferenceInformationType: "Direct"');
        arrayNode(3, 'UV', uvs.join(','), triangleCount * 3 * 2);
        line(2, '}');
      }
      line(2, 'LayerElementMaterial: 0 {');
      line(3, 'Version: 101');
      line(3, 'Name: ""');
      line(3, 'MappingInformationType: "AllSame"');
      line(3, 'ReferenceInformationType: "IndexToDirect"');
      arrayNode(3, 'Materials', '0', 1);
      line(2, '}');
      line(2, 'Layer: 0 {');
      line(3, 'Version: 100');
      line(3, 'LayerElement:  {');
      line(4, 'Type: "LayerElementNormal"');
      line(4, 'TypedIndex: 0');
      line(3, '}');
      if (uv) {
        line(3, 'LayerElement:  {');
        line(4, 'Type: "LayerElementUV"');
        line(4, 'TypedIndex: 0');
        line(3, '}');
      }
      line(3, 'LayerElement:  {');
      line(4, 'Type: "LayerElementMaterial"');
      line(4, 'TypedIndex: 0');
      line(3, '}');
      line(2, '}');
      line(1, '}');

      line(1, `Model: ${modelId}, "Model::${plan.name}", "Mesh" {`);
      line(2, 'Version: 232');
      line(2, 'Properties70:  {');
      property(3, 'Lcl Translation', 'Lcl Translation', '0,0,0');
      property(3, 'Lcl Rotation', 'Lcl Rotation', '0,0,0');
      property(3, 'Lcl Scaling', 'Lcl Scaling', '1,1,1');
      line(2, '}');
      line(2, 'Shading: T');
      line(2, `Culling: "${materialFor(plan.mesh).doubleSided ? 'CullingOff' : 'CullingOn'}"`);
      line(1, '}');

      connections.push(`C: "OO",${geometryId},${modelId}`);
      connections.push(`C: "OO",${materialId},${modelId}`);
    } finally {
      geometry.dispose();
    }

    options.onProgress?.(index + 1, plans.length, plan.name);
    await yieldToUi();
  }

  for (const material of materialList) {
    const emissive = new THREE.Color(
      material.emissive.r,
      material.emissive.g,
      material.emissive.b,
    );
    line(1, `Material: ${material.id}, "Material::${material.name}", "" {`);
    line(2, 'Version: 102');
    line(2, 'ShadingModel: "phong"');
    line(2, 'MultiLayer: 0');
    line(2, 'Properties70:  {');
    property(
      3,
      'DiffuseColor',
      'Color',
      `${fmt(material.color.r)},${fmt(material.color.g)},${fmt(material.color.b)}`,
    );
    property(3, 'SpecularColor', 'Color', '0.2,0.2,0.2');
    property(3, 'EmissiveColor', 'Color', `${fmt(emissive.r)},${fmt(emissive.g)},${fmt(emissive.b)}`);
    property(3, 'ShininessExponent', 'Number', fmt(material.shininess));
    property(3, 'Opacity', 'double', fmt(material.opacity));
    line(2, '}');
    line(1, '}');
  }

  line(0, '}');
  line(0, 'Connections:  {');
  for (const connection of connections) line(1, connection);
  line(0, '}');
  line(0, 'Takes:  {');
  line(1, 'Current: ""');
  line(0, '}');

  return out.join('\n');
}

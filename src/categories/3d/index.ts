import { Box, Eye, Hash, Package, RefreshCw } from 'lucide-react';
import type { CategoryModule, ToolDefinition } from '../../core/types';

const tools: ToolDefinition[] = [
  {
    id: 'model-viewer',
    name: '3D Model Viewer',
    category: '3d',
    subcategory: 'preview',
    description: 'Load GLB, GLTF, FBX, OBJ, STL, PLY or DAE files and inspect them with orbit drag, zoom, wireframe and animation playback.',
    keywords: ['3d', 'model', 'viewer', 'preview', 'glb', 'gltf', 'fbx', 'obj', 'stl', 'ply', 'dae', 'wireframe', 'animation', 'drag', 'orbit'],
    formats: ['GLB', 'GLTF', 'FBX', 'OBJ', 'STL', 'PLY', 'DAE'],
    icon: Eye,
    load: () => import('./tools/model-viewer'),
  },
  {
    id: 'model-converter',
    name: '3D Model Converter',
    category: '3d',
    subcategory: 'convert',
    description: 'Convert models between GLB, glTF, OBJ, STL, PLY and ASCII FBX in the browser; DAE is import-only.',
    keywords: ['3d', 'convert', 'model', 'glb', 'gltf', 'obj', 'stl', 'ply', 'fbx', 'fbx export', 'dae', 'format', 'export'],
    formats: ['GLB', 'GLTF', 'OBJ', 'STL', 'PLY', 'FBX'],
    icon: RefreshCw,
    load: () => import('./tools/model-converter'),
  },
  {
    id: 'texture-extractor',
    name: 'Texture Extractor',
    category: '3d',
    subcategory: 'extract',
    description: 'Extract embedded textures and a material/texture map from any GLB or glTF file.',
    keywords: ['3d', 'texture', 'extract', 'glb', 'gltf', 'embedded', 'material', 'textures', 'zip'],
    formats: ['GLB', 'GLTF'],
    icon: Package,
    load: () => import('./tools/texture-extractor'),
  },
  {
    id: 'fbx-asset-extractor',
    name: 'FBX Asset Extractor',
    category: '3d',
    subcategory: 'extract',
    description: 'Extract meshes and embedded textures from FBX files, or split components with independent materials and texture references.',
    keywords: ['fbx', 'extract', 'mesh', 'texture', 'assets', '3d', 'obj', 'stl', 'ply', 'glb', 'zip', 'batch', 'split', 'component', 'material', 'mtl', 'unity'],
    formats: ['FBX'],
    icon: Package,
    load: () => import('./tools/fbx-asset-extractor'),
  },
  {
    id: 'mesh-stats',
    name: 'Mesh Statistics',
    category: '3d',
    subcategory: 'mesh',
    description: 'Per-mesh vertex/triangle counts, attribute coverage, draw-call and vertex-memory estimates, exported as CSV/JSON.',
    keywords: ['3d', 'mesh', 'statistics', 'vertices', 'triangles', 'polygons', 'draw calls', 'vram', 'optimization', 'report'],
    formats: ['GLB', 'GLTF', 'FBX', 'OBJ', 'STL', 'PLY', 'DAE'],
    icon: Hash,
    load: () => import('./tools/mesh-stats'),
  },
];

export const category: CategoryModule = {
  category: {
    id: '3d',
    name: '3D Tools',
    description:
      'Inspect, convert and optimise 3D models. Preview meshes, extract embedded textures and materials, and check animation clips — all in the browser.',
    icon: Box,
    accent: 'violet',
    subcategories: [
      { id: 'convert', name: 'Convert' },
      { id: 'preview', name: 'Preview' },
      { id: 'optimize', name: 'Optimize' },
      { id: 'extract', name: 'Extract' },
      { id: 'mesh', name: 'Mesh' },
      { id: 'material', name: 'Material' },
      { id: 'animation', name: 'Animation' },
      { id: 'export', name: 'Export' },
    ],
  },
  tools,
};

export default category;

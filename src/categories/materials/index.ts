import { Cylinder, FileOutput, Palette } from 'lucide-react';
import type { CategoryModule, ToolDefinition } from '../../core/types';

const tools: ToolDefinition[] = [
  {
    id: 'pbr-preview',
    name: 'PBR Material Preview',
    category: 'materials',
    subcategory: 'pbr',
    description: 'Preview a material on a sphere, box, plane or torus with six texture slots and five lighting presets.',
    keywords: ['pbr', 'material', 'base colour', 'metallic', 'roughness', 'normal', 'ambient occlusion', 'emission', 'lighting', 'environment', '3d preview', 'sphere'],
    formats: ['PNG', 'JPG', 'WebP'],
    icon: Cylinder,
    load: () => import('./tools/pbr-preview'),
  },
  {
    id: 'material-exporter',
    name: 'Material Exporter',
    category: 'materials',
    subcategory: 'export',
    description: 'Turn PBR values into JSON, a glTF material fragment, Unity Standard-shader YAML or a three.js snippet.',
    keywords: ['material', 'export', 'json', 'unity', 'urp', 'hdrp', 'standard shader', 'gltf', 'pbr values'],
    formats: ['JSON'],
    icon: FileOutput,
    load: () => import('./tools/material-exporter'),
  },
];

export const category: CategoryModule = {
  category: {
    id: 'materials',
    name: 'Material Tools',
    description:
      'Preview PBR materials on a 3D object with real lighting, check map assignments and export material definitions.',
    icon: Palette,
    accent: 'amber',
    subcategories: [
      { id: 'pbr', name: 'PBR Preview' },
      { id: 'export', name: 'Export' },
    ],
  },
  tools,
};

export default category;

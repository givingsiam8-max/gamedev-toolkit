import { Copy, FileWarning, Gauge, ScanSearch } from 'lucide-react';
import type { CategoryModule, ToolDefinition } from '../../core/types';

const tools: ToolDefinition[] = [
  {
    id: 'texture-audit',
    name: 'Texture Audit',
    category: 'optimization',
    subcategory: 'image',
    description: 'Audit textures for power-of-two compliance, size, alpha usage and estimated VRAM, with CSV export.',
    keywords: ['texture', 'audit', 'size', 'power of two', 'alpha', 'savings', 'report', 'batch', 'vram', 'atlas candidate'],
    formats: ['PNG', 'JPG', 'WebP'],
    icon: ScanSearch,
    load: () => import('./tools/texture-audit'),
  },
  {
    id: 'duplicate-image-finder',
    name: 'Duplicate Image Finder',
    category: 'optimization',
    subcategory: 'image',
    description: 'Find exact duplicates by SHA-256 and near duplicates by 64-bit dHash, grouped with previews.',
    keywords: ['duplicate', 'similar', 'hash', 'perceptual', 'dhash', 'sha256', 'find', 'cleanup', 'near duplicate'],
    formats: ['PNG', 'JPG', 'WebP'],
    icon: Copy,
    load: () => import('./tools/duplicate-image-finder'),
  },
  {
    id: 'asset-naming-validator',
    name: 'Asset Naming Validator',
    category: 'optimization',
    subcategory: 'project',
    description: 'Check asset names against naming conventions and get deterministic suggested fixes, exported as CSV.',
    keywords: ['naming', 'convention', 'validate', 'pascal case', 'prefix', 'unity', 'assets', 'rename', 'lint', 'folder'],
    icon: FileWarning,
    load: () => import('./tools/asset-naming-validator'),
  },
];

export const category: CategoryModule = {
  category: {
    id: 'optimization',
    name: 'Optimization',
    description:
      'Find what is bloating your build: texture audits, duplicate detection, render cost estimates and asset naming validation.',
    icon: Gauge,
    accent: 'lime',
    subcategories: [
      { id: 'image', name: 'Image & Texture' },
      { id: 'mesh', name: '3D & Render' },
      { id: 'project', name: 'Project' },
    ],
  },
  tools,
};

export default category;

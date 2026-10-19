import { Grid2x2, Scissors, SquareDashed } from 'lucide-react';
import type { CategoryModule, ToolDefinition } from '../../core/types';

const tools: ToolDefinition[] = [
  {
    id: 'sprite-sheet-generator',
    name: 'Sprite Sheet Generator',
    category: 'sprites',
    subcategory: 'generate',
    description: 'Arrange frames into a sprite sheet with padding, margin and automatic cell sizing, plus a JSON frame map.',
    keywords: ['sprite sheet', 'spritesheet', 'animation frames', 'rows', 'columns', 'padding', 'margin', 'json', 'export'],
    formats: ['PNG', 'JPG', 'WebP'],
    icon: Grid2x2,
    load: () => import('./tools/sprite-sheet-generator'),
  },
  {
    id: 'sprite-sheet-splitter',
    name: 'Sprite Sheet Splitter',
    category: 'sprites',
    subcategory: 'split',
    description: 'Split a sheet by rows and columns into individual PNGs, previewed with a grid overlay.',
    keywords: ['split', 'slice', 'grid', 'rows', 'columns', 'extract frames', 'zip', 'tile'],
    formats: ['PNG', 'JPG', 'WebP'],
    icon: Scissors,
    load: () => import('./tools/sprite-sheet-splitter'),
  },
  {
    id: 'sprite-auto-slicer',
    name: 'Sprite Auto Slicer',
    category: 'sprites',
    subcategory: 'split',
    description: 'Detect sprites as connected opaque regions on a transparent sheet and export each with a JSON map.',
    keywords: ['auto slice', 'detect sprites', 'alpha', 'regions', 'trim', 'pack', 'atlas'],
    formats: ['PNG', 'JPG', 'WebP'],
    icon: SquareDashed,
    load: () => import('./tools/sprite-auto-slicer'),
  },
];

export const category: CategoryModule = {
  category: {
    id: 'sprites',
    name: 'Sprite Tools',
    description:
      '2D workflows: build sprite sheets and atlases, split existing sheets, auto-slice sprites and trim transparent padding.',
    icon: Grid2x2,
    accent: 'pink',
    subcategories: [
      { id: 'generate', name: 'Generate' },
      { id: 'split', name: 'Split & Slice' },
      { id: 'resize', name: 'Resize' },
      { id: 'atlas', name: 'Atlas' },
    ],
  },
  tools,
};

export default category;

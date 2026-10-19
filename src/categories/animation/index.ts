import {
  Clapperboard,
  Film,
  GalleryHorizontal,
  Grid3x3,
  ListOrdered,
  Play,
} from 'lucide-react';
import type { CategoryModule, ToolDefinition } from '../../core/types';

const tools: ToolDefinition[] = [
  {
    id: 'gif-viewer',
    name: 'GIF Viewer',
    category: 'animation',
    subcategory: 'gif',
    description: 'Decode a GIF, play or step through frames, and inspect timing and dimensions.',
    keywords: ['gif', 'viewer', 'frames', 'play', 'pause', 'step', 'speed', 'delay', 'loop'],
    formats: ['GIF'],
    icon: Film,
    load: () => import('./tools/gif-viewer'),
  },
  {
    id: 'gif-to-frames',
    name: 'GIF to Frames',
    category: 'animation',
    subcategory: 'gif',
    description: 'Extract composited GIF frames as numbered PNG files in a ZIP.',
    keywords: ['gif', 'frames', 'png', 'sequence', 'extract', 'zip', 'sprite'],
    formats: ['GIF'],
    icon: GalleryHorizontal,
    load: () => import('./tools/gif-to-frames'),
  },
  {
    id: 'gif-to-sprite-sheet',
    name: 'GIF to Sprite Sheet',
    category: 'animation',
    subcategory: 'gif',
    description: 'Lay every GIF frame into a sprite sheet with padding and a JSON timing map.',
    keywords: ['gif', 'sprite sheet', 'spritesheet', 'animation', 'rows', 'columns', 'export'],
    formats: ['GIF'],
    icon: Grid3x3,
    load: () => import('./tools/gif-to-sprite-sheet'),
  },
  {
    id: 'frames-to-gif',
    name: 'Frames to GIF',
    category: 'animation',
    subcategory: 'frames',
    description: 'Encode an image sequence into an animated GIF with delay, palette size and loop options.',
    keywords: ['gif', 'animation', 'frames', 'png sequence', 'encode', 'loop', 'delay', 'palette'],
    formats: ['PNG', 'JPG', 'WebP'],
    icon: Clapperboard,
    load: () => import('./tools/frames-to-gif'),
  },
  {
    id: 'sprite-animation-preview',
    name: 'Sprite Animation Preview',
    category: 'animation',
    subcategory: 'preview',
    description: 'Play dropped frames at any FPS with scrubbing and a requestAnimationFrame clock.',
    keywords: ['sprite', 'animation', 'preview', 'fps', 'playback', 'frames', 'scrub', 'loop'],
    formats: ['PNG', 'JPG', 'WebP'],
    icon: Play,
    load: () => import('./tools/sprite-animation-preview'),
  },
  {
    id: 'image-sequence-organizer',
    name: 'Image Sequence Organizer',
    category: 'animation',
    subcategory: 'frames',
    description: 'Natural-sort an image sequence and export it renamed with a zero-padded numbering scheme.',
    keywords: ['sequence', 'rename', 'sort', 'numbering', 'frames', 'batch', 'zip', 'natural sort'],
    formats: ['PNG', 'JPG', 'WebP'],
    icon: ListOrdered,
    load: () => import('./tools/image-sequence-organizer'),
  },
];

export const category: CategoryModule = {
  category: {
    id: 'animation',
    name: 'Animation Tools',
    description:
      'Frame-based animation utilities: view GIFs, export frames, build GIFs from image sequences and preview sprite animations.',
    icon: Film,
    accent: 'orange',
    subcategories: [
      { id: 'gif', name: 'GIF' },
      { id: 'frames', name: 'Frames' },
      { id: 'preview', name: 'Preview' },
    ],
  },
  tools,
};

export default category;

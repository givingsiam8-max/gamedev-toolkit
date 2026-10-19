import { Image, Scissors, Sparkles, Wand2 } from 'lucide-react';
import type { CategoryModule } from '../../core/types';

/**
 * Photo Editing
 * A lightweight photo editor built for game art: crop, enhance, lighting, colour grading, background work and effects with before/after preview.
 *
 * Tools are independent modules: add an entry to `tools` below and create the
 * matching component in ./tools/<id>.tsx with a default export. The lazy
 * `load` keeps heavy libraries out of the initial bundle.
 */
export const category: CategoryModule = {
  category: {
    id: 'photo',
    name: 'Photo Editing',
    description:
      'A lightweight photo editor built for game art: crop, enhance, lighting, colour grading, background work and effects with before/after preview.',
    icon: Wand2,
    accent: 'rose',
    subcategories: [
    { id: 'basic', name: 'Basic Editing' },
    { id: 'enhance', name: 'Enhancement' },
    { id: 'lighting', name: 'Lighting' },
    { id: 'color', name: 'Color' },
    { id: 'background', name: 'Background' },
    { id: 'effects', name: 'Effects' },
    ],
  },
  tools: [
    {
      id: 'photo-editor',
      name: 'Photo Editor',
      category: 'photo',
      subcategory: 'enhance',
      description:
        'Crop, resize, adjust, colour-grade and add effects to photos with live preview, undo history and before/after comparison.',
      keywords: [
        'editor', 'crop', 'rotate', 'flip', 'brightness', 'contrast', 'saturation', 'exposure',
        'highlights', 'shadows', 'sharpen', 'clarity', 'blur', 'vignette', 'undo', 'redo',
        'before after', 'resize', 'canvas',
      ],
      formats: ['PNG', 'JPG', 'WebP'],
      icon: Wand2,
      load: () => import('./tools/photo-editor'),
    },
    {
      id: 'background-remover',
      name: 'Background Remover',
      category: 'photo',
      subcategory: 'background',
      description: 'Remove a flat background by colour keying, with click-to-sample, tolerance and edge feathering.',
      keywords: ['remove background', 'transparent', 'chroma key', 'green screen', 'magic wand', 'colour key', 'alpha', 'cutout', 'tolerance'],
      formats: ['PNG', 'JPG', 'WebP'],
      icon: Scissors,
      load: () => import('./tools/background-remover'),
    },
    {
      id: 'background-replacer',
      name: 'Background Replacer',
      category: 'photo',
      subcategory: 'background',
      description: 'Swap a flat background for a solid colour, gradient, blurred copy or transparency.',
      keywords: ['replace background', 'blur', 'colour fill', 'gradient', 'transparent', 'backdrop'],
      formats: ['PNG', 'JPG', 'WebP'],
      icon: Image,
      load: () => import('./tools/background-replacer'),
    },
    {
      id: 'photo-filters',
      name: 'Photo Filters',
      category: 'photo',
      subcategory: 'effects',
      description: 'Apply vintage, cinematic, warm, cool and mono grades with an adjustable blend strength.',
      keywords: ['filter', 'preset', 'vintage', 'sepia', 'monochrome', 'cinematic', 'grade', 'warmth', 'strength'],
      formats: ['PNG', 'JPG', 'WebP'],
      icon: Sparkles,
      load: () => import('./tools/photo-filters'),
    },
  ],
};

export default category;

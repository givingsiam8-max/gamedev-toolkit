import { Frame, Ruler, Type, Wrench } from 'lucide-react';
import type { CategoryModule, ToolDefinition } from '../../core/types';

const tools: ToolDefinition[] = [
  {
    id: 'unit-converter',
    name: 'Unit Converter',
    category: 'utilities',
    subcategory: 'convert',
    description: 'Convert length, data size, time, angle, speed, temperature and pixel/DPI units.',
    keywords: ['unit', 'convert', 'px', 'inch', 'cm', 'mm', 'dpi', 'bytes', 'time', 'angle', 'degrees', 'radians', 'speed'],
    icon: Ruler,
    load: () => import('./tools/unit-converter'),
  },
  {
    id: 'aspect-ratio-calculator',
    name: 'Aspect Ratio Calculator',
    category: 'utilities',
    subcategory: 'layout',
    description: 'Compute aspect ratios, scaled resolutions, letterbox/pillarbox bars and horizontal↔vertical FOV.',
    keywords: ['aspect ratio', 'resolution', '16:9', '4:3', 'scale', 'letterbox', 'safe area', 'fov', 'camera', 'calculator'],
    icon: Frame,
    load: () => import('./tools/aspect-ratio-calculator'),
  },
  {
    id: 'lorem-ipsum-generator',
    name: 'Placeholder Text Generator',
    category: 'utilities',
    subcategory: 'text',
    description: 'Generate lorem ipsum or game-flavoured placeholder text by paragraph, sentence or word count.',
    keywords: ['lorem ipsum', 'placeholder', 'dummy text', 'game text', 'dialogue', 'mock', 'strings'],
    formats: ['TXT'],
    icon: Type,
    load: () => import('./tools/lorem-ipsum-generator'),
  },
];

export const category: CategoryModule = {
  category: {
    id: 'utilities',
    name: 'Utilities',
    description:
      'Small helpers that do not deserve their own category: unit conversion, aspect ratios and placeholder text.',
    icon: Wrench,
    accent: 'slate',
    subcategories: [
      { id: 'convert', name: 'Convert' },
      { id: 'layout', name: 'Layout' },
      { id: 'text', name: 'Text' },
    ],
  },
  tools,
};

export default category;

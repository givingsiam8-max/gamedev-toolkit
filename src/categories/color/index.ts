import { Blend, Contrast, Image, Pipette, SwatchBook } from 'lucide-react';
import type { CategoryModule, ToolDefinition } from '../../core/types';

const tools: ToolDefinition[] = [
  {
    id: 'color-converter',
    name: 'Color Converter',
    category: 'color',
    subcategory: 'pick',
    description: 'Pick a colour and read it as HEX, RGB, RGBA, HSL, HSV and CMYK, with alpha and channel sliders.',
    keywords: ['hex', 'rgb', 'rgba', 'hsl', 'hsv', 'cmyk', 'picker', 'eyedropper', 'convert', 'colour', 'swatch'],
    icon: Pipette,
    load: () => import('./tools/color-converter'),
  },
  {
    id: 'palette-generator',
    name: 'Palette Generator',
    category: 'color',
    subcategory: 'palette',
    description: 'Generate complementary, analogous, triadic, tetradic and shade palettes, exported as CSS or JSON.',
    keywords: ['palette', 'harmony', 'complementary', 'analogous', 'triadic', 'tetradic', 'scheme', 'css variables', 'export'],
    icon: SwatchBook,
    load: () => import('./tools/palette-generator'),
  },
  {
    id: 'palette-from-image',
    name: 'Palette From Image',
    category: 'color',
    subcategory: 'palette',
    description: 'Extract a frequency-weighted palette from any image and copy each hex value.',
    keywords: ['extract colours', 'palette', 'dominant colours', 'image', 'quantize', 'gradient'],
    formats: ['PNG', 'JPG', 'WebP'],
    icon: Image,
    load: () => import('./tools/palette-from-image'),
  },
  {
    id: 'gradient-generator',
    name: 'Gradient Generator',
    category: 'color',
    subcategory: 'palette',
    description: 'Build linear, radial and conic gradients with CSS output and a 1920 × 1080 PNG export.',
    keywords: ['gradient', 'linear', 'radial', 'conic', 'css', 'ramp', 'export', 'stops'],
    formats: ['PNG'],
    icon: Blend,
    load: () => import('./tools/gradient-generator'),
  },
  {
    id: 'contrast-checker',
    name: 'Contrast Checker',
    category: 'color',
    subcategory: 'accessibility',
    description: 'Check text/background contrast against WCAG AA and AAA, with live previews and fixes.',
    keywords: ['contrast', 'wcag', 'aa', 'aaa', 'accessibility', 'readability', 'ratio', 'ui text'],
    icon: Contrast,
    load: () => import('./tools/contrast-checker'),
  },
];

export const category: CategoryModule = {
  category: {
    id: 'color',
    name: 'Color Tools',
    description:
      'Colour work for games: pick and convert between every model, build palettes and gradients, extract colours from images and check contrast.',
    icon: Pipette,
    accent: 'fuchsia',
    subcategories: [
      { id: 'pick', name: 'Pick & Convert' },
      { id: 'palette', name: 'Palettes' },
      { id: 'accessibility', name: 'Accessibility' },
    ],
  },
  tools,
};

export default category;

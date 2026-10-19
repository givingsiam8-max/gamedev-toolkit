/**
 * Generates placeholder category modules so the registry, navigation and
 * dashboard work before individual tools are implemented.
 *
 * Usage: node scripts/scaffold-categories.mjs
 * Existing index.ts files are overwritten only when --force is passed.
 */
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const force = process.argv.includes('--force');

const CATEGORIES = [
  {
    id: '3d',
    name: '3D Tools',
    icon: 'Box',
    accent: 'violet',
    description:
      'Inspect, convert and optimise 3D models. Preview meshes, extract embedded textures and materials, and check animation clips — all in the browser.',
    subcategories: [
      ['convert', 'Convert'],
      ['preview', 'Preview'],
      ['optimize', 'Optimize'],
      ['extract', 'Extract'],
      ['mesh', 'Mesh'],
      ['material', 'Material'],
      ['animation', 'Animation'],
      ['export', 'Export'],
    ],
  },
  {
    id: 'images',
    name: 'Image Tools',
    icon: 'Image',
    accent: 'sky',
    description:
      'Everyday image work: resize, convert, compress, crop and batch process PNG, JPG, WebP, BMP and SVG files.',
    subcategories: [
      ['convert', 'Convert'],
      ['resize', 'Resize'],
      ['compress', 'Compress'],
      ['crop', 'Crop'],
      ['batch', 'Batch'],
      ['metadata', 'Metadata'],
    ],
  },
  {
    id: 'photo',
    name: 'Photo Editing',
    icon: 'Wand2',
    accent: 'rose',
    description:
      'A lightweight photo editor built for game art: crop, enhance, lighting, colour grading, background work and effects with before/after preview.',
    subcategories: [
      ['basic', 'Basic Editing'],
      ['enhance', 'Enhancement'],
      ['lighting', 'Lighting'],
      ['color', 'Color'],
      ['background', 'Background'],
      ['effects', 'Effects'],
    ],
  },
  {
    id: 'textures',
    name: 'Texture Tools',
    icon: 'Layers',
    accent: 'emerald',
    description:
      'Game-ready texture workflows: power-of-two resizing, format conversion, channel inspection, PBR map preview, seamless tiling and atlases.',
    subcategories: [
      ['resize', 'Resize'],
      ['convert', 'Convert'],
      ['compress', 'Compress'],
      ['maps', 'Maps & Channels'],
      ['atlas', 'Atlas'],
      ['analysis', 'Analysis'],
    ],
  },
  {
    id: 'materials',
    name: 'Material Tools',
    icon: 'Palette',
    accent: 'amber',
    description:
      'Preview PBR materials on a 3D object with real lighting, check map assignments and export material definitions.',
    subcategories: [
      ['pbr', 'PBR Preview'],
      ['export', 'Export'],
    ],
  },
  {
    id: 'unity',
    name: 'Unity Tools',
    icon: 'Gamepad2',
    accent: 'indigo',
    description:
      'Unity developer utilities: GUID helpers, .meta generation, layer bitmasks, quaternion and vector maths, transform conversion and build calculators.',
    subcategories: [
      ['asset', 'Asset Tools'],
      ['csharp', 'C# & Maths'],
      ['scene', 'Scene Tools'],
      ['build', 'Build Tools'],
      ['optimization', 'Optimization'],
    ],
  },
  {
    id: 'sprites',
    name: 'Sprite Tools',
    icon: 'Grid2x2',
    accent: 'pink',
    description:
      '2D workflows: build sprite sheets and atlases, split existing sheets, auto-slice sprites and trim transparent padding.',
    subcategories: [
      ['generate', 'Generate'],
      ['split', 'Split & Slice'],
      ['resize', 'Resize'],
      ['atlas', 'Atlas'],
    ],
  },
  {
    id: 'audio',
    name: 'Audio Tools',
    icon: 'Music',
    accent: 'cyan',
    description:
      'Inspect and edit game audio: convert formats, trim, normalise, adjust volume, fade in/out and view waveforms.',
    subcategories: [
      ['convert', 'Convert'],
      ['edit', 'Edit'],
      ['analyze', 'Analyze'],
    ],
  },
  {
    id: 'animation',
    name: 'Animation Tools',
    icon: 'Film',
    accent: 'orange',
    description:
      'Frame-based animation utilities: view GIFs, export frames, build GIFs from image sequences and preview sprite animations.',
    subcategories: [
      ['gif', 'GIF'],
      ['frames', 'Frames'],
      ['preview', 'Preview'],
    ],
  },
  {
    id: 'files',
    name: 'File Conversion',
    icon: 'RefreshCw',
    accent: 'teal',
    description:
      'Convert between file containers and encodings: archives, icons, SVG rasterisation, base64 payloads and text encodings.',
    subcategories: [
      ['convert', 'Convert'],
      ['archive', 'Archive'],
      ['encode', 'Encoding'],
    ],
  },
  {
    id: 'developer',
    name: 'Developer Tools',
    icon: 'Braces',
    accent: 'blue',
    description:
      'Data and text utilities developers reach for daily: JSON, XML, YAML, regex testing, diffs, hashing, encoding and ID generation.',
    subcategories: [
      ['json', 'JSON'],
      ['text', 'Text'],
      ['encoding', 'Encoding'],
      ['generate', 'Generators'],
    ],
  },
  {
    id: 'data',
    name: 'Data Tools',
    icon: 'Database',
    accent: 'green',
    description:
      'Work with tabular and structured data: inspect CSV, convert between CSV, JSON and YAML, explore JSON trees.',
    subcategories: [
      ['tables', 'Tables'],
      ['convert', 'Convert'],
      ['inspect', 'Inspect'],
    ],
  },
  {
    id: 'color',
    name: 'Color Tools',
    icon: 'Pipette',
    accent: 'fuchsia',
    description:
      'Colour work for games: pick and convert between every model, build palettes and gradients, extract colours from images and check contrast.',
    subcategories: [
      ['pick', 'Pick & Convert'],
      ['palette', 'Palettes'],
      ['accessibility', 'Accessibility'],
    ],
  },
  {
    id: 'optimization',
    name: 'Optimization',
    icon: 'Gauge',
    accent: 'lime',
    description:
      'Find what is bloating your build: texture audits, duplicate detection, render cost estimates and asset naming validation.',
    subcategories: [
      ['image', 'Image & Texture'],
      ['mesh', '3D & Render'],
      ['project', 'Project'],
    ],
  },
  {
    id: 'utilities',
    name: 'Utilities',
    icon: 'Wrench',
    accent: 'slate',
    description: 'Small helpers that do not deserve their own category: unit conversion, aspect ratios and placeholder text.',
    subcategories: [
      ['convert', 'Convert'],
      ['layout', 'Layout'],
      ['text', 'Text'],
    ],
  },
];

for (const category of CATEGORIES) {
  const dir = join(root, 'src', 'categories', category.id);
  mkdirSync(join(dir, 'tools'), { recursive: true });
  const file = join(dir, 'index.ts');
  if (existsSync(file) && !force) {
    console.log(`skip   ${category.id}/index.ts (exists)`);
    continue;
  }

  const subs = category.subcategories
    .map(([id, name]) => `    { id: '${id}', name: '${name}' },`)
    .join('\n');

  const content = `import { ${category.icon} } from 'lucide-react';
import type { CategoryModule } from '../../core/types';

/**
 * ${category.name}
 * ${category.description}
 *
 * Tools are independent modules: add an entry to \`tools\` below and create the
 * matching component in ./tools/<id>.tsx with a default export. The lazy
 * \`load\` keeps heavy libraries out of the initial bundle.
 */
export const category: CategoryModule = {
  category: {
    id: '${category.id}',
    name: '${category.name}',
    description:
      '${category.description.replace(/'/g, "\\'")}',
    icon: ${category.icon},
    accent: '${category.accent}',
    subcategories: [
${subs}
    ],
  },
  tools: [
    // Registered tools are added here by the category module.
  ],
};

export default category;
`;

  writeFileSync(file, content, 'utf8');
  console.log(`write  ${category.id}/index.ts (${category.subcategories.length} subcategories)`);
}

console.log('\nDone. Category folders scaffolded under src/categories/.');

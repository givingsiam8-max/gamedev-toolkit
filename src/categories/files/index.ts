import { Archive, Binary, FileImage, FileType, Square, RefreshCw } from 'lucide-react';
import type { CategoryModule, ToolDefinition } from '../../core/types';

const tools: ToolDefinition[] = [
  {
    id: 'zip-tool',
    name: 'Archive Tool',
    category: 'files',
    subcategory: 'archive',
    description: 'Pack dropped files into a ZIP, or open a ZIP and save any entry.',
    keywords: ['zip', 'unzip', 'archive', 'extract', 'compress', 'multiple files', 'download', 'package'],
    formats: ['ZIP'],
    icon: Archive,
    load: () => import('./tools/zip-tool'),
  },
  {
    id: 'svg-to-png',
    name: 'SVG to PNG',
    category: 'files',
    subcategory: 'convert',
    description: 'Rasterise an SVG to PNG at any width, with a transparent or solid background.',
    keywords: ['svg', 'png', 'rasterize', 'scale', 'dpi', 'icon', 'vector', 'transparent'],
    formats: ['SVG'],
    icon: FileImage,
    load: () => import('./tools/svg-to-png'),
  },
  {
    id: 'ico-generator',
    name: 'Icon Generator',
    category: 'files',
    subcategory: 'convert',
    description: 'Build a multi-size Windows .ico file from a square image.',
    keywords: ['ico', 'favicon', 'windows icon', 'multi size', 'png to ico', 'app icon', '16 32 48 256'],
    formats: ['PNG', 'ICO'],
    icon: Square,
    load: () => import('./tools/ico-generator'),
  },
  {
    id: 'base64-file-converter',
    name: 'Base64 File Converter',
    category: 'files',
    subcategory: 'encode',
    description: 'Turn any file into Base64 or a data URI, and decode Base64 back into a file.',
    keywords: ['base64', 'file', 'data uri', 'encode', 'decode', 'embed', 'css', 'inline'],
    formats: ['Any'],
    icon: Binary,
    load: () => import('./tools/base64-file-converter'),
  },
  {
    id: 'text-encoding-converter',
    name: 'Text Encoding Converter',
    category: 'files',
    subcategory: 'encode',
    description: 'Re-encode text files between UTF-8, UTF-16 and Latin encodings, with BOM inspection and mojibake detection.',
    keywords: ['utf-8', 'utf-16', 'latin1', 'bom', 'encoding', 'charset', 'mojibake', 'windows-1252'],
    formats: ['TXT', 'CSV', 'JSON'],
    icon: FileType,
    load: () => import('./tools/text-encoding-converter'),
  },
];

export const category: CategoryModule = {
  category: {
    id: 'files',
    name: 'File Conversion',
    description:
      'Convert between file containers and encodings: archives, icons, SVG rasterisation, Base64 payloads and text encodings.',
    icon: RefreshCw,
    accent: 'teal',
    subcategories: [
      { id: 'convert', name: 'Convert' },
      { id: 'archive', name: 'Archive' },
      { id: 'encode', name: 'Encoding' },
    ],
  },
  tools,
};

export default category;
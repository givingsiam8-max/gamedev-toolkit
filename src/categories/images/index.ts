import { Archive, Crop, Image, Info, Layers, Maximize2, RefreshCw } from 'lucide-react';
import type { CategoryModule, ToolDefinition } from '../../core/types';

const tools: ToolDefinition[] = [
  {
    id: 'image-format-converter',
    name: 'Image Format Converter',
    category: 'images',
    subcategory: 'convert',
    description: 'Batch-convert PNG, JPG and WebP with quality control and a background for dropped alpha.',
    keywords: ['png to jpg', 'jpg to png', 'png to webp', 'webp', 'bmp', 'svg', 'gif', 'convert', 'format', 'batch', 'transparency', 'alpha'],
    formats: ['PNG', 'JPG', 'WebP', 'BMP', 'GIF', 'SVG'],
    icon: RefreshCw,
    load: () => import('./tools/image-format-converter'),
  },
  {
    id: 'image-resizer',
    name: 'Image Resizer',
    category: 'images',
    subcategory: 'resize',
    description: 'Resize to exact pixels, percentages or presets with aspect locking, fill modes and batch export.',
    keywords: ['resize', 'scale', 'dimensions', 'resolution', 'percentage', 'exact pixel', 'presets', 'power of two', 'batch'],
    formats: ['PNG', 'JPG', 'WebP', 'BMP'],
    icon: Maximize2,
    load: () => import('./tools/image-resizer'),
  },
  {
    id: 'image-compressor',
    name: 'Image Compressor',
    category: 'images',
    subcategory: 'compress',
    description: 'Reduce image size in lossless PNG or quality-controlled WebP/JPG mode, with per-file savings.',
    keywords: ['compress', 'optimize', 'reduce file size', 'quality', 'lossless', 'lossy', 'batch', 'shrink', 'size'],
    formats: ['PNG', 'JPG', 'WebP'],
    icon: Archive,
    load: () => import('./tools/image-compressor'),
  },
  {
    id: 'image-cropper',
    name: 'Image Cropper',
    category: 'images',
    subcategory: 'crop',
    description: 'Crop an image by exact region with preset aspect ratios and download the result.',
    keywords: ['crop', 'trim', 'aspect ratio', '1:1', '16:9', 'region', 'cut', 'framing'],
    formats: ['PNG', 'JPG', 'WebP'],
    icon: Crop,
    load: () => import('./tools/image-cropper'),
  },
  {
    id: 'batch-image-processor',
    name: 'Batch Image Processor',
    category: 'images',
    subcategory: 'batch',
    description: 'Chain resize, convert and quality steps and apply them to a whole batch, then download a ZIP.',
    keywords: ['batch', 'bulk', 'pipeline', 'resize convert compress', 'multiple images', 'automation'],
    formats: ['PNG', 'JPG', 'WebP'],
    icon: Layers,
    load: () => import('./tools/batch-image-processor'),
  },
  {
    id: 'image-metadata',
    name: 'Image Inspector',
    category: 'images',
    subcategory: 'metadata',
    description: 'Inspect dimensions, MIME type, alpha usage and power-of-two status for each dropped image.',
    keywords: ['metadata', 'exif', 'dimensions', 'dpi', 'channels', 'bit depth', 'alpha', 'file size', 'inspector', 'info'],
    formats: ['PNG', 'JPG', 'WebP', 'BMP', 'GIF'],
    icon: Info,
    load: () => import('./tools/image-metadata'),
  },
];

export const category: CategoryModule = {
  category: {
    id: 'images',
    name: 'Image Tools',
    description:
      'Everyday image work: resize, convert, compress, crop and batch process PNG, JPG, WebP, BMP and SVG files.',
    icon: Image,
    accent: 'sky',
    subcategories: [
      { id: 'convert', name: 'Convert' },
      { id: 'resize', name: 'Resize' },
      { id: 'compress', name: 'Compress' },
      { id: 'crop', name: 'Crop' },
      { id: 'batch', name: 'Batch' },
      { id: 'metadata', name: 'Metadata' },
    ],
  },
  tools,
};

export default category;

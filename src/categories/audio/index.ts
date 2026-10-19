import { AudioLines, Music, Scissors, Volume2 } from 'lucide-react';
import type { CategoryModule, ToolDefinition } from '../../core/types';

const tools: ToolDefinition[] = [
  {
    id: 'audio-converter',
    name: 'Audio Converter',
    category: 'audio',
    subcategory: 'convert',
    description: 'Decode MP3, WAV, OGG, M4A or FLAC and export 16-bit WAV or MP3, with mono downmix and bitrate options.',
    keywords: ['audio', 'convert', 'wav', 'mp3', 'ogg', 'format', 'encode', 'sample rate', 'bitrate', 'mono'],
    formats: ['MP3', 'WAV', 'OGG', 'M4A', 'FLAC', 'AAC'],
    icon: Music,
    load: () => import('./tools/audio-converter'),
  },
  {
    id: 'audio-trimmer',
    name: 'Audio Trimmer',
    category: 'audio',
    subcategory: 'edit',
    description: 'Trim audio by start and end time with region preview, then export WAV or MP3.',
    keywords: ['trim', 'cut', 'crop', 'start', 'end', 'audio', 'export', 'sfx', 'loop'],
    formats: ['WAV', 'MP3', 'OGG'],
    icon: Scissors,
    load: () => import('./tools/audio-trimmer'),
  },
  {
    id: 'audio-gain',
    name: 'Audio Level Tools',
    category: 'audio',
    subcategory: 'edit',
    description: 'Apply gain, peak normalization, fade in/out and soft clipping, then export WAV or MP3.',
    keywords: ['normalize', 'volume', 'gain', 'fade in', 'fade out', 'amplify', 'peak', 'decibel', 'loudness'],
    formats: ['WAV', 'MP3', 'OGG'],
    icon: Volume2,
    load: () => import('./tools/audio-gain'),
  },
  {
    id: 'waveform-viewer',
    name: 'Waveform Viewer',
    category: 'audio',
    subcategory: 'analyze',
    description: 'Draw a waveform and report peak, RMS, silence, DC offset and clipping per channel.',
    keywords: ['waveform', 'audio analysis', 'peak', 'rms', 'sample rate', 'channels', 'duration', 'silence', 'clipping'],
    formats: ['MP3', 'WAV', 'OGG', 'M4A'],
    icon: AudioLines,
    load: () => import('./tools/waveform-viewer'),
  },
];

export const category: CategoryModule = {
  category: {
    id: 'audio',
    name: 'Audio Tools',
    description:
      'Inspect and edit game audio: convert formats, trim, normalise, adjust volume, fade in/out and view waveforms.',
    icon: Music,
    accent: 'cyan',
    subcategories: [
      { id: 'convert', name: 'Convert' },
      { id: 'edit', name: 'Edit' },
      { id: 'analyze', name: 'Analyze' },
    ],
  },
  tools,
};

export default category;

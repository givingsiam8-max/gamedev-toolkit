import { AudioLines, Music } from 'lucide-react';
import type { CategoryModule, ToolDefinition } from '../../core/types';

const tools: ToolDefinition[] = [
  {
    id: 'easy-audio-editor',
    name: 'Easy Audio Editor',
    category: 'audio',
    subcategory: 'easy',
    badge: 'new',
    description:
      'Upload, play and edit audio with a visual waveform: trim, cut, split, speed, pitch, volume, fades, mute, undo and MP3/WAV export.',
    keywords: [
      'audio editor',
      'easy',
      'trim',
      'cut',
      'split',
      'waveform',
      'volume',
      'fade in',
      'fade out',
      'speed',
      'slower',
      'faster',
      'pitch',
      'mute',
      'undo',
      'redo',
      'mp3',
      'wav',
      'sfx',
    ],
    formats: ['MP3', 'WAV', 'OGG', 'M4A', 'AAC', 'FLAC'],
    icon: Music,
    load: () => import('./tools/easy-audio-editor'),
  },
  {
    id: 'advanced-audio-editor',
    name: 'Advanced Audio Editor',
    category: 'audio',
    subcategory: 'advanced',
    badge: 'new',
    description:
      'The same visual editor with BPM tempo matching, exact gain, speed and pitch, sample rate, bit depth, mono/stereo, normalization, compression, EQ and export quality.',
    keywords: [
      'advanced audio editor',
      'bpm',
      'tempo',
      'gain',
      'decibel',
      'semitone',
      'sample rate',
      'bit depth',
      '24-bit',
      'mono',
      'stereo',
      'normalize',
      'compression',
      'equalizer',
      'eq',
      'bitrate',
      'trim',
      'split',
      'waveform',
    ],
    formats: ['MP3', 'WAV', 'OGG', 'M4A', 'AAC', 'FLAC'],
    icon: AudioLines,
    load: () => import('./tools/advanced-audio-editor'),
  },
];

export const category: CategoryModule = {
  category: {
    id: 'audio',
    name: 'Audio Tools',
    description:
      'Edit game audio visually: trim, cut, split, change speed and pitch, add fades, then polish with BPM, EQ, compression and MP3/WAV export.',
    icon: Music,
    accent: 'cyan',
    subcategories: [
      { id: 'easy', name: 'Easy Editing' },
      { id: 'advanced', name: 'Advanced Editing' },
    ],
  },
  tools,
};

export default category;

import { useMemo, useState } from 'react';
import { Download, RefreshCw, Sparkles } from 'lucide-react';
import { ToolShell } from '../../../components/ToolShell';
import {
  Button,
  CopyButton,
  Field,
  Notice,
  NumberInput,
  Panel,
  Segmented,
  TextArea,
  useToast,
} from '../../../components/ui';
import { downloadText } from '../../../core/files';

type Mode = 'paragraphs' | 'sentences' | 'words';
type Flavour = 'classic' | 'game';

const CLASSIC = [
  'lorem', 'ipsum', 'dolor', 'sit', 'amet', 'consectetur', 'adipiscing', 'elit', 'sed', 'do',
  'eiusmod', 'tempor', 'incididunt', 'ut', 'labore', 'et', 'dolore', 'magna', 'aliqua', 'enim',
  'ad', 'minim', 'veniam', 'quis', 'nostrud', 'exercitation', 'ullamco', 'laboris', 'nisi',
  'aliquip', 'ex', 'ea', 'commodo', 'consequat', 'duis', 'aute', 'irure', 'in', 'reprehenderit',
  'voluptate', 'velit', 'esse', 'cillum', 'fugiat', 'nulla', 'pariatur',
];

const PREFIX = ['Ancient', 'Cursed', 'Ember', 'Frost', 'Shadow', 'Radiant', 'Ruined', 'Verdant', 'Storm', 'Obsidian'];
const NOUN = ['Blade', 'Sigil', 'Relic', 'Crown', 'Talisman', 'Compass', 'Lantern', 'Gauntlet', 'Codex', 'Charm'];
const SUFFIX = ['of the Fallen King', 'of Ember Hollow', 'of the Silent Vale', 'of the Warden', 'of Ashen Winds', 'of the Deep'];
const NAMES = ['Kael', 'Mira', 'Thorne', 'Sable', 'Orin', 'Vex', 'Ilya', 'Bram'];
const DIALOGUE = [
  'The gate will not hold much longer.',
  'We need to move before dawn.',
  'Do you hear that?',
  'Take the north road and do not look back.',
  'The old maps are wrong.',
  'Something is following us.',
];

const pick = <T,>(items: T[]): T => items[Math.floor(Math.random() * items.length)];

function classicWords(count: number): string[] {
  return Array.from({ length: count }, () => pick(CLASSIC));
}

function classicSentence(): string {
  const count = 8 + Math.floor(Math.random() * 9);
  const words = classicWords(count);
  const first = words[0];
  return `${first[0].toUpperCase()}${first.slice(1)} ${words.slice(1).join(' ')}.`;
}

function gameSentence(): string {
  const roll = Math.random();
  if (roll < 0.4) return `${pick(PREFIX)} ${pick(NOUN)} ${pick(SUFFIX)}.`;
  if (roll < 0.75) return `“${pick(DIALOGUE)}” said ${pick(NAMES)}.`;
  return `${pick(NAMES)} gripped the ${pick(NOUN).toLowerCase()} and stepped into the dark.`;
}

function build(mode: Mode, count: number, flavour: Flavour, seed: number): string {
  void seed;
  if (mode === 'words') {
    const words =
      flavour === 'classic'
        ? classicWords(count)
        : Array.from({ length: count }, () => `${pick(PREFIX)} ${pick(NOUN)}`.toLowerCase());
    return words.join(' ');
  }
  const makeSentence = flavour === 'classic' ? classicSentence : gameSentence;
  if (mode === 'sentences') {
    return Array.from({ length: count }, makeSentence).join(' ');
  }
  return Array.from({ length: count }, () => {
    const sentences = Array.from({ length: 3 + Math.floor(Math.random() * 3) }, makeSentence);
    return sentences.join(' ');
  }).join('\n\n');
}

export default function LoremIpsumGenerator() {
  const toast = useToast();
  const [mode, setMode] = useState<Mode>('paragraphs');
  const [flavour, setFlavour] = useState<Flavour>('classic');
  const [count, setCount] = useState(3);
  const [seed, setSeed] = useState(0);

  const output = useMemo(() => build(mode, count, flavour, seed), [mode, count, flavour, seed]);

  const reset = () => {
    setMode('paragraphs');
    setFlavour('classic');
    setCount(3);
    setSeed((value) => value + 1);
  };

  return (
    <ToolShell
      sidebar={
        <>
          <Field label="Unit">
            <Segmented
              options={[
                { value: 'paragraphs', label: 'Paragraphs' },
                { value: 'sentences', label: 'Sentences' },
                { value: 'words', label: 'Words' },
              ]}
              value={mode}
              onChange={(v) => setMode(v)}
            />
          </Field>
          <Field label="Amount">
            <NumberInput value={count} min={1} max={mode === 'words' ? 500 : 50} onChange={setCount} />
          </Field>
          <Field label="Flavour">
            <Segmented
              options={[
                { value: 'classic', label: 'Lorem ipsum' },
                { value: 'game', label: 'Game text' },
              ]}
              value={flavour}
              onChange={(v) => setFlavour(v)}
            />
          </Field>
          <Button variant="outline" icon={<Sparkles />} onClick={() => setSeed((value) => value + 1)}>
            Regenerate
          </Button>
          <Notice tone="info">
            Game flavour generates items (“Ancient Sigil of the Warden”), dialogue lines with speaker
            attributions, and short action beats — useful for mock UI and localization tests.
          </Notice>
        </>
      }
      actions={
        <>
          <Button variant="ghost" icon={<RefreshCw />} onClick={reset}>
            Reset
          </Button>
          <CopyButton value={output} label="Copy text" />
          <Button
            variant="success"
            icon={<Download />}
            onClick={() => {
              downloadText(output, 'placeholder.txt');
              toast.success('Downloaded.');
            }}
          >
            Download
          </Button>
        </>
      }
      info={`${count} ${mode} · ${output.split(/\s+/).filter(Boolean).length} words`}
    >
      <Panel title="Generated text">
        <TextArea value={output} readOnly style={{ minHeight: 420 }} />
      </Panel>
    </ToolShell>
  );
}

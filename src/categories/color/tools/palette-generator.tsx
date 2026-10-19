import { useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { ToolShell } from '../../../components/ToolShell';
import {
  Button,
  CopyButton,
  Field,
  Notice,
  Panel,
  Segmented,
  TextInput,
  useToast,
} from '../../../components/ui';
import {
  harmonies,
  hexToRgb,
  luminanceToReadableText,
  rgbToHex,
  type RGB,
} from '../../../core/color';
import { downloadText } from '../../../core/files';

type Format = 'css' | 'json' | 'hex';

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');

export default function PaletteGenerator() {
  const toast = useToast();
  const [hex, setHex] = useState('#3B82F6');
  const [format, setFormat] = useState<Format>('css');

  const parsed = useMemo(() => hexToRgb(hex), [hex]);
  const sets = useMemo(() => (parsed ? harmonies(parsed) : []), [parsed]);

  const exportText = useMemo(() => {
    if (!parsed) return '';
    if (format === 'css') {
      const lines = [':root {'];
      lines.push(`  --color-base: ${rgbToHex(parsed)};`);
      sets.forEach((set) => {
        set.colors.forEach((c, i) => {
          lines.push(`  --color-${slug(set.name)}-${i + 1}: ${rgbToHex(c)};`);
        });
      });
      lines.push('}');
      return lines.join('\n');
    }
    if (format === 'json') {
      return JSON.stringify(
        {
          base: rgbToHex(parsed),
          harmonies: sets.map((s) => ({
            name: s.name,
            colors: s.colors.map((c) => rgbToHex(c)),
          })),
        },
        null,
        2,
      );
    }
    return sets.flatMap((s) => s.colors.map((c) => rgbToHex(c))).join('\n');
  }, [parsed, sets, format]);

  const copySwatch = async (colour: RGB) => {
    const value = rgbToHex(colour);
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`Copied ${value}`);
    } catch {
      toast.error('Clipboard blocked — copy the value from the palette export.');
    }
  };

  return (
    <ToolShell
      sidebar={
        <>
          <Field label="Base colour">
            <div className="row">
              <input
                type="color"
                className="input"
                value={parsed ? rgbToHex(parsed) : '#000000'}
                onChange={(event) => setHex(event.target.value)}
                style={{ width: 64, padding: 2 }}
              />
              <TextInput value={hex} onChange={(event) => setHex(event.target.value)} className="mono" />
            </div>
          </Field>
          <Field label="Export format">
            <Segmented
              options={[
                { value: 'css', label: 'CSS vars' },
                { value: 'json', label: 'JSON' },
                { value: 'hex', label: 'Hex list' },
              ]}
              value={format}
              onChange={(v) => setFormat(v)}
            />
          </Field>
          <Notice tone="info">
            Click any swatch to copy its hex value. “Shades” is a manual light/dark ramp; the other
            rows are hue rotations around the colour wheel.
          </Notice>
        </>
      }
      actions={
        <>
          <Button variant="ghost" icon={<RefreshCw />} onClick={() => setHex('#3B82F6')}>
            Reset
          </Button>
          <CopyButton value={exportText} label="Copy palette" variant="outline" />
          <Button
            variant="success"
            onClick={() => {
              downloadText(exportText, `palette.${format === 'json' ? 'json' : format === 'css' ? 'css' : 'txt'}`);
              toast.success('Downloaded palette.');
            }}
          >
            Download
          </Button>
        </>
      }
    >
      {!parsed && (
        <Notice tone="error" title="Invalid colour">
          Enter a hex value such as #3B82F6.
        </Notice>
      )}

      {parsed && (
        <>
          <Panel title="Base">
            <button
              type="button"
              onClick={() => void copySwatch(parsed)}
              style={{
                width: '100%',
                height: 64,
                borderRadius: 10,
                border: '1px solid var(--border-strong)',
                background: rgbToHex(parsed),
                color: luminanceToReadableText(parsed),
                fontFamily: 'var(--font-mono)',
                fontSize: 14,
                cursor: 'pointer',
              }}
            >
              {rgbToHex(parsed)} — click to copy
            </button>
          </Panel>

          {sets.map((set) => (
            <Panel key={set.name} title={set.name}>
              <div className="row-wrap" style={{ gap: 8 }}>
                {set.colors.map((colour, index) => {
                  const value = rgbToHex(colour);
                  return (
                    <button
                      key={`${set.name}-${index}`}
                      type="button"
                      onClick={() => void copySwatch(colour)}
                      title={`Click to copy ${value}`}
                      style={{
                        width: 92,
                        height: 58,
                        borderRadius: 8,
                        border: '1px solid var(--border-strong)',
                        background: value,
                        color: luminanceToReadableText(colour),
                        fontSize: 10.5,
                        fontFamily: 'var(--font-mono)',
                        cursor: 'pointer',
                      }}
                    >
                      {value}
                    </button>
                  );
                })}
              </div>
            </Panel>
          ))}

          <Panel title={`Export — ${format.toUpperCase()}`}>
            <pre className="code" style={{ maxHeight: 260 }}>{exportText}</pre>
          </Panel>
        </>
      )}
    </ToolShell>
  );
}

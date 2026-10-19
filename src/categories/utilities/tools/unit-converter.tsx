import { useMemo, useState } from 'react';
import { ArrowLeftRight, RefreshCw } from 'lucide-react';
import { ToolShell } from '../../../components/ToolShell';
import {
  Button,
  CopyField,
  Field,
  Notice,
  NumberInput,
  Panel,
  Select,
  Stat,
} from '../../../components/ui';

interface Category {
  id: string;
  label: string;
  units: Array<{ id: string; label: string; factor: number }>;
  special?: 'temperature';
}

const CATEGORIES: Category[] = [
  {
    id: 'length',
    label: 'Length',
    units: [
      { id: 'mm', label: 'Millimetres (mm)', factor: 0.001 },
      { id: 'cm', label: 'Centimetres (cm)', factor: 0.01 },
      { id: 'm', label: 'Metres (m)', factor: 1 },
      { id: 'km', label: 'Kilometres (km)', factor: 1000 },
      { id: 'in', label: 'Inches (in)', factor: 0.0254 },
      { id: 'ft', label: 'Feet (ft)', factor: 0.3048 },
      { id: 'yd', label: 'Yards (yd)', factor: 0.9144 },
      { id: 'mi', label: 'Miles (mi)', factor: 1609.344 },
    ],
  },
  {
    id: 'data',
    label: 'Data size',
    units: [
      { id: 'B', label: 'Bytes (B)', factor: 1 },
      { id: 'KB', label: 'Kilobytes (KB, 1000)', factor: 1000 },
      { id: 'MB', label: 'Megabytes (MB, 1000²)', factor: 1e6 },
      { id: 'GB', label: 'Gigabytes (GB, 1000³)', factor: 1e9 },
      { id: 'KiB', label: 'Kibibytes (KiB, 1024)', factor: 1024 },
      { id: 'MiB', label: 'Mebibytes (MiB, 1024²)', factor: 1024 ** 2 },
      { id: 'GiB', label: 'Gibibytes (GiB, 1024³)', factor: 1024 ** 3 },
    ],
  },
  {
    id: 'time',
    label: 'Time',
    units: [
      { id: 'ms', label: 'Milliseconds (ms)', factor: 0.001 },
      { id: 's', label: 'Seconds (s)', factor: 1 },
      { id: 'min', label: 'Minutes (min)', factor: 60 },
      { id: 'h', label: 'Hours (h)', factor: 3600 },
      { id: 'frames', label: 'Frames @ 60 fps', factor: 1 / 60 },
    ],
  },
  {
    id: 'angle',
    label: 'Angle',
    units: [
      { id: 'deg', label: 'Degrees (°)', factor: Math.PI / 180 },
      { id: 'rad', label: 'Radians (rad)', factor: 1 },
      { id: 'grad', label: 'Gradians', factor: Math.PI / 200 },
      { id: 'turn', label: 'Turns', factor: Math.PI * 2 },
    ],
  },
  {
    id: 'speed',
    label: 'Speed',
    units: [
      { id: 'mps', label: 'Metres / second', factor: 1 },
      { id: 'kmh', label: 'Kilometres / hour', factor: 1 / 3.6 },
      { id: 'mph', label: 'Miles / hour', factor: 0.44704 },
      { id: 'knot', label: 'Knots', factor: 0.514444 },
      { id: 'fps', label: 'Feet / second', factor: 0.3048 },
    ],
  },
  {
    id: 'temperature',
    label: 'Temperature',
    special: 'temperature',
    units: [
      { id: 'C', label: 'Celsius (°C)', factor: 1 },
      { id: 'F', label: 'Fahrenheit (°F)', factor: 1 },
      { id: 'K', label: 'Kelvin (K)', factor: 1 },
    ],
  },
  {
    id: 'resolution',
    label: 'Resolution (DPI)',
    units: [
      { id: 'px', label: 'Pixels (px)', factor: 1 },
      { id: 'in', label: 'Inches (in)', factor: 1 },
      { id: 'cm', label: 'Centimetres (cm)', factor: 1 },
      { id: 'mm', label: 'Millimetres (mm)', factor: 1 },
    ],
  },
];

const toCelsius = (value: number, unit: string): number => {
  if (unit === 'F') return ((value - 32) * 5) / 9;
  if (unit === 'K') return value - 273.15;
  return value;
};

const fromCelsius = (value: number, unit: string): number => {
  if (unit === 'F') return (value * 9) / 5 + 32;
  if (unit === 'K') return value + 273.15;
  return value;
};

function convert(category: Category, value: number, from: string, to: string, dpi: number): number {
  if (category.special === 'temperature') {
    return fromCelsius(toCelsius(value, from), to);
  }
  if (category.id === 'resolution') {
    const toInches = (v: number, unit: string): number => {
      if (unit === 'px') return v / dpi;
      if (unit === 'cm') return v / 2.54;
      if (unit === 'mm') return v / 25.4;
      return v;
    };
    const fromInches = (v: number, unit: string): number => {
      if (unit === 'px') return v * dpi;
      if (unit === 'cm') return v * 2.54;
      if (unit === 'mm') return v * 25.4;
      return v;
    };
    return fromInches(toInches(value, from), to);
  }
  const fromUnit = category.units.find((u) => u.id === from);
  const toUnit = category.units.find((u) => u.id === to);
  if (!fromUnit || !toUnit) return value;
  return (value * fromUnit.factor) / toUnit.factor;
}

export default function UnitConverter() {
  const [categoryId, setCategoryId] = useState('length');
  const [value, setValue] = useState(1);
  const [from, setFrom] = useState('m');
  const [to, setTo] = useState('ft');
  const [dpi, setDpi] = useState(96);

  const category = CATEGORIES.find((c) => c.id === categoryId) ?? CATEGORIES[0];

  const result = useMemo(() => {
    const converted = convert(category, value, from, to, dpi);
    return Number.isFinite(converted) ? converted : 0;
  }, [category, value, from, to, dpi]);

  const changeCategory = (id: string) => {
    const next = CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[0];
    setCategoryId(id);
    setFrom(next.units[0].id);
    setTo(next.units[1]?.id ?? next.units[0].id);
  };

  const swap = () => {
    setFrom(to);
    setTo(from);
  };

  const formatted = Number.isFinite(result)
    ? Math.abs(result) >= 1e9 || (Math.abs(result) < 1e-4 && result !== 0)
      ? result.toExponential(6)
      : result.toLocaleString('en-US', { maximumFractionDigits: 6 })
    : '—';

  const reset = () => {
    setCategoryId('length');
    setValue(1);
    setFrom('m');
    setTo('ft');
    setDpi(96);
  };

  return (
    <ToolShell
      sidebar={
        <>
          <Field label="Category">
            <Select
              value={categoryId}
              onChange={(e) => changeCategory(e.target.value)}
              options={CATEGORIES.map((c) => ({ value: c.id, label: c.label }))}
            />
          </Field>
          <Field label="Value">
            <NumberInput value={value} onChange={setValue} step={1} />
          </Field>
          <Field label="From">
            <Select value={from} onChange={(e) => setFrom(e.target.value)} options={category.units.map((u) => ({ value: u.id, label: u.label }))} />
          </Field>
          <div className="row">
            <Button variant="outline" icon={<ArrowLeftRight />} onClick={swap}>
              Swap
            </Button>
          </div>
          <Field label="To">
            <Select value={to} onChange={(e) => setTo(e.target.value)} options={category.units.map((u) => ({ value: u.id, label: u.label }))} />
          </Field>
          {category.id === 'resolution' && (
            <Field label="DPI" hint="Pixels per inch. 96 is the CSS reference; print is usually 300.">
              <NumberInput value={dpi} min={1} max={2400} onChange={setDpi} />
            </Field>
          )}
          <Notice tone="info">
            Data sizes distinguish decimal (KB = 1000 B) from binary (KiB = 1024 B). Time includes a
            60 fps frame unit for animation timing.
          </Notice>
        </>
      }
      actions={
        <Button variant="ghost" icon={<RefreshCw />} onClick={reset}>
          Reset
        </Button>
      }
    >
      <Panel title="Result">
        <div className="stack">
          <CopyField
            label={`${value} ${category.units.find((u) => u.id === from)?.label ?? from} =`}
            value={`${formatted} ${category.units.find((u) => u.id === to)?.label ?? to}`}
            mono={false}
          />
          <CopyField label="Raw value" value={String(result)} />
        </div>
      </Panel>
      <div className="grid-3">
        <Stat label="Category" value={category.label} />
        <Stat label="Input" value={`${value} ${from}`} />
        <Stat label="Output" value={`${formatted} ${to}`} />
      </div>
      {category.id === 'resolution' && (
        <Notice tone="info">
          At {dpi} DPI, 1 inch = {dpi} px; 1 cm = {(dpi / 2.54).toFixed(2)} px; 1 mm ={' '}
          {(dpi / 25.4).toFixed(3)} px.
        </Notice>
      )}
    </ToolShell>
  );
}

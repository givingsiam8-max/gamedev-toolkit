/**
 * Colour maths used by the colour, texture, material and Unity tools.
 * Conversions follow the standard CSS/sRGB definitions.
 */

export interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}
export interface RGB {
  r: number;
  g: number;
  b: number;
}
export interface HSL {
  h: number;
  s: number;
  l: number;
}
export interface HSV {
  h: number;
  s: number;
  v: number;
}
export interface CMYK {
  c: number;
  m: number;
  y: number;
  k: number;
}

export const clamp255 = (value: number) => Math.min(255, Math.max(0, Math.round(value)));

export function rgbToHex({ r, g, b }: RGB): string {
  return `#${[r, g, b].map((v) => clamp255(v).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

export function rgbaToHex({ r, g, b, a }: RGBA): string {
  const base = rgbToHex({ r, g, b });
  if (a >= 255) return base;
  return `${base}${clamp255(a).toString(16).padStart(2, '0').toUpperCase()}`;
}

export function hexToRgb(hex: string): RGB | null {
  let clean = hex.trim().replace(/^#/, '');
  if (clean.length === 3 || clean.length === 4) {
    clean = clean
      .split('')
      .map((c) => c + c)
      .join('');
  }
  if (clean.length !== 6 && clean.length !== 8) return null;
  if (!/^[0-9a-f]+$/i.test(clean)) return null;
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

export function hexToRgba(hex: string): RGBA | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const clean = hex.trim().replace(/^#/, '');
  const alpha = clean.length === 8 ? parseInt(clean.slice(6, 8), 16) : 255;
  return { ...rgb, a: alpha };
}

export function rgbToHsl({ r, g, b }: RGB): HSL {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  let h = 0;
  if (delta !== 0) {
    if (max === rn) h = ((gn - bn) / delta) % 6;
    else if (max === gn) h = (bn - rn) / delta + 2;
    else h = (rn - gn) / delta + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const l = (max + min) / 2;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
  return { h, s: s * 100, l: l * 100 };
}

export function hslToRgb({ h, s, l }: HSL): RGB {
  const hn = ((h % 360) + 360) % 360;
  const sn = Math.min(100, Math.max(0, s)) / 100;
  const ln = Math.min(100, Math.max(0, l)) / 100;
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const x = c * (1 - Math.abs(((hn / 60) % 2) - 1));
  const m = ln - c / 2;
  let rgb: [number, number, number];
  if (hn < 60) rgb = [c, x, 0];
  else if (hn < 120) rgb = [x, c, 0];
  else if (hn < 180) rgb = [0, c, x];
  else if (hn < 240) rgb = [0, x, c];
  else if (hn < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  return {
    r: clamp255((rgb[0] + m) * 255),
    g: clamp255((rgb[1] + m) * 255),
    b: clamp255((rgb[2] + m) * 255),
  };
}

export function rgbToHsv({ r, g, b }: RGB): HSV {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  let h = 0;
  if (delta !== 0) {
    if (max === rn) h = ((gn - bn) / delta) % 6;
    else if (max === gn) h = (bn - rn) / delta + 2;
    else h = (rn - gn) / delta + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : (delta / max) * 100, v: max * 100 };
}

export function hsvToRgb({ h, s, v }: HSV): RGB {
  const hn = ((h % 360) + 360) % 360;
  const sn = Math.min(100, Math.max(0, s)) / 100;
  const vn = Math.min(100, Math.max(0, v)) / 100;
  const c = vn * sn;
  const x = c * (1 - Math.abs(((hn / 60) % 2) - 1));
  const m = vn - c;
  let rgb: [number, number, number];
  if (hn < 60) rgb = [c, x, 0];
  else if (hn < 120) rgb = [x, c, 0];
  else if (hn < 180) rgb = [0, c, x];
  else if (hn < 240) rgb = [0, x, c];
  else if (hn < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  return {
    r: clamp255((rgb[0] + m) * 255),
    g: clamp255((rgb[1] + m) * 255),
    b: clamp255((rgb[2] + m) * 255),
  };
}

export function rgbToCmyk({ r, g, b }: RGB): CMYK {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const k = 1 - Math.max(rn, gn, bn);
  if (k === 1) return { c: 0, m: 0, y: 0, k: 100 };
  return {
    c: ((1 - rn - k) / (1 - k)) * 100,
    m: ((1 - gn - k) / (1 - k)) * 100,
    y: ((1 - bn - k) / (1 - k)) * 100,
    k: k * 100,
  };
}

export function cmykToRgb({ c, m, y, k }: CMYK): RGB {
  const cn = c / 100;
  const mn = m / 100;
  const yn = y / 100;
  const kn = k / 100;
  return {
    r: clamp255(255 * (1 - cn) * (1 - kn)),
    g: clamp255(255 * (1 - mn) * (1 - kn)),
    b: clamp255(255 * (1 - yn) * (1 - kn)),
  };
}

export function formatRgb({ r, g, b }: RGB): string {
  return `rgb(${clamp255(r)}, ${clamp255(g)}, ${clamp255(b)})`;
}

export function formatRgba({ r, g, b, a }: RGBA): string {
  const alpha = typeof a === 'number' ? a / 255 : 1;
  return `rgba(${clamp255(r)}, ${clamp255(g)}, ${clamp255(b)}, ${Number(alpha.toFixed(3))})`;
}

export function formatHsl(hsl: HSL): string {
  return `hsl(${Math.round(hsl.h)}, ${Math.round(hsl.s)}%, ${Math.round(hsl.l)}%)`;
}

export function formatHsv(hsv: HSV): string {
  return `hsv(${Math.round(hsv.h)}, ${Math.round(hsv.s)}%, ${Math.round(hsv.v)}%)`;
}

export function formatCmyk(cmyk: CMYK): string {
  return `cmyk(${Math.round(cmyk.c)}%, ${Math.round(cmyk.m)}%, ${Math.round(cmyk.y)}%, ${Math.round(cmyk.k)}%)`;
}

/** Parses any CSS colour string the browser understands. */
export function parseCssColor(input: string): RGBA | null {
  const value = input.trim();
  if (!value) return null;
  const hex = hexToRgba(value);
  if (hex) return hex;

  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#000';
  const normalised = value.toLowerCase();
  ctx.fillStyle = normalised;
  if (ctx.fillStyle === '#000000' && normalised !== '#000' && normalised !== '#000000' && normalised !== 'black') {
    // fillStyle rejected the input.
    if (!/^(rgb|rgba|hsl|hsla|color|hwb|lab|lch|oklab|oklch|transparent|currentcolor)/.test(normalised)) {
      return null;
    }
  }
  ctx.fillRect(0, 0, 1, 1);
  const data = ctx.getImageData(0, 0, 1, 1).data;
  if (data[3] === 0 && normalised !== 'transparent') {
    const probe = ctx.getImageData(0, 0, 1, 1).data;
    if (probe[0] === 0 && probe[1] === 0 && probe[2] === 0 && !/^(rgba?|hsla?)\(/.test(normalised)) {
      return null;
    }
  }
  return { r: data[0], g: data[1], b: data[2], a: data[3] };
}

/** WCAG relative luminance (0..1). */
export function relativeLuminance({ r, g, b }: RGB): number {
  const channel = (value: number) => {
    const v = value / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio, 1..21. */
export function contrastRatio(a: RGB, b: RGB): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const light = Math.max(la, lb);
  const dark = Math.min(la, lb);
  return (light + 0.05) / (dark + 0.05);
}

export type WcagLevel = 'AAA' | 'AA' | 'AA Large' | 'Fail';

export function wcagLevel(ratio: number, large = false): WcagLevel {
  if (ratio >= 7) return 'AAA';
  if (ratio >= 4.5) return 'AA';
  if (large && ratio >= 3) return 'AA Large';
  return 'Fail';
}

export function luminanceToReadableText(color: RGB): '#000000' | '#FFFFFF' {
  return relativeLuminance(color) > 0.45 ? '#000000' : '#FFFFFF';
}

/** Rotates hue by degrees — used by harmony and palette generators. */
export function rotateHue(color: RGB, degrees: number): RGB {
  const hsl = rgbToHsl(color);
  return hslToRgb({ ...hsl, h: (hsl.h + degrees + 360) % 360 });
}

export function lighten(color: RGB, amount: number): RGB {
  const hsl = rgbToHsl(color);
  return hslToRgb({ ...hsl, l: Math.min(100, hsl.l + amount) });
}

export function darken(color: RGB, amount: number): RGB {
  const hsl = rgbToHsl(color);
  return hslToRgb({ ...hsl, l: Math.max(0, hsl.l - amount) });
}

export function saturate(color: RGB, amount: number): RGB {
  const hsl = rgbToHsl(color);
  return hslToRgb({ ...hsl, s: Math.min(100, Math.max(0, hsl.s + amount)) });
}

export interface HarmonySet {
  name: string;
  colors: RGB[];
}

export function harmonies(base: RGB): HarmonySet[] {
  return [
    { name: 'Complementary', colors: [base, rotateHue(base, 180)] },
    {
      name: 'Analogous',
      colors: [rotateHue(base, -30), base, rotateHue(base, 30)],
    },
    {
      name: 'Triadic',
      colors: [base, rotateHue(base, 120), rotateHue(base, 240)],
    },
    {
      name: 'Split complementary',
      colors: [base, rotateHue(base, 150), rotateHue(base, 210)],
    },
    {
      name: 'Tetradic',
      colors: [base, rotateHue(base, 90), rotateHue(base, 180), rotateHue(base, 270)],
    },
    {
      name: 'Shades',
      colors: [darken(base, 30), darken(base, 15), base, lighten(base, 15), lighten(base, 30)],
    },
  ];
}

/**
 * Uniform quantisation palette generator. Deterministic and dependency-free —
 * good enough for extracting a palette that represents the image, and fast
 * enough to run on every drop.
 */
export function extractPalette(data: ImageData, count = 6): RGB[] {
  const buckets = new Map<number, { r: number; g: number; b: number; n: number }>();
  const pixels = data.data;

  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] < 128) continue;
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.r += r;
      bucket.g += g;
      bucket.b += b;
      bucket.n += 1;
    } else {
      buckets.set(key, { r, g, b, n: 1 });
    }
  }

  return [...buckets.values()]
    .sort((a, b) => b.n - a.n)
    .slice(0, count)
    .map((bucket) => ({
      r: Math.round(bucket.r / bucket.n),
      g: Math.round(bucket.g / bucket.n),
      b: Math.round(bucket.b / bucket.n),
    }));
}

export function averageOf(colors: RGB[]): RGB {
  if (!colors.length) return { r: 0, g: 0, b: 0 };
  const sum = colors.reduce(
    (acc, c) => ({ r: acc.r + c.r, g: acc.g + c.g, b: acc.b + c.b }),
    { r: 0, g: 0, b: 0 },
  );
  return {
    r: Math.round(sum.r / colors.length),
    g: Math.round(sum.g / colors.length),
    b: Math.round(sum.b / colors.length),
  };
}

/** Nearest named colour for display purposes. */
const NAMED_COLORS: Array<[string, RGB]> = [
  ['Black', { r: 0, g: 0, b: 0 }],
  ['White', { r: 255, g: 255, b: 255 }],
  ['Gray', { r: 128, g: 128, b: 128 }],
  ['Silver', { r: 192, g: 192, b: 192 }],
  ['Red', { r: 255, g: 0, b: 0 }],
  ['Crimson', { r: 220, g: 20, b: 60 }],
  ['Orange', { r: 255, g: 165, b: 0 }],
  ['Amber', { r: 255, g: 191, b: 0 }],
  ['Yellow', { r: 255, g: 255, b: 0 }],
  ['Lime', { r: 128, g: 255, b: 0 }],
  ['Green', { r: 0, g: 128, b: 0 }],
  ['Emerald', { r: 16, g: 185, b: 129 }],
  ['Teal', { r: 0, g: 128, b: 128 }],
  ['Cyan', { r: 0, g: 255, b: 255 }],
  ['Sky', { r: 14, g: 165, b: 233 }],
  ['Blue', { r: 0, g: 0, b: 255 }],
  ['Indigo', { r: 99, g: 102, b: 241 }],
  ['Violet', { r: 139, g: 92, b: 246 }],
  ['Purple', { r: 128, g: 0, b: 128 }],
  ['Magenta', { r: 255, g: 0, b: 255 }],
  ['Pink', { r: 255, g: 105, b: 180 }],
  ['Brown', { r: 139, g: 69, b: 19 }],
  ['Tan', { r: 210, g: 180, b: 140 }],
  ['Navy', { r: 0, g: 0, b: 128 }],
  ['Olive', { r: 128, g: 128, b: 0 }],
];

export function nearestColorName(color: RGB): string {
  let best = NAMED_COLORS[0];
  let bestDistance = Infinity;
  for (const entry of NAMED_COLORS) {
    const d =
      (entry[1].r - color.r) ** 2 + (entry[1].g - color.g) ** 2 + (entry[1].b - color.b) ** 2;
    if (d < bestDistance) {
      bestDistance = d;
      best = entry;
    }
  }
  return best[0];
}

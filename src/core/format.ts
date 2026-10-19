/**
 * Formatting helpers shared by every tool. All numeric output in the UI goes
 * through these so units and separators stay consistent.
 */

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];

export function formatBytes(bytes: number, digits?: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes === 0) return '0 B';
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const auto = value >= 100 || unit === 0 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(digits ?? auto)} ${UNITS[unit]}`;
}

/** Binary size such as "1.4 MiB" — used where exact powers of two matter. */
export function formatBytesBinary(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—';
  const units = ['B', 'KiB', 'MiB', 'GiB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : value >= 10 ? 1 : 2)} ${units[unit]}`;
}

export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return value.toLocaleString('en-US');
}

export function formatCompact(value: number): string {
  if (!Number.isFinite(value)) return '—';
  if (Math.abs(value) < 1000) return String(Math.round(value));
  return value.toLocaleString('en-US', { notation: 'compact', maximumFractionDigits: 1 });
}

export function formatPercent(value: number, digits = 0): string {
  if (!Number.isFinite(value)) return '—';
  return `${value.toFixed(digits)}%`;
}

/** Signed delta such as "-56.2%" or "+3.1%". */
export function formatDeltaPercent(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(digits)}%`;
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  if (seconds < 1) return `${Math.round(seconds * 1000)} ms`;
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 2 : 1)} s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function round(value: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

export function basename(path: string): string {
  const clean = path.split(/[\\/]/).pop() ?? path;
  return clean;
}

export function extname(path: string): string {
  const name = basename(path);
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return '';
  return name.slice(dot + 1).toLowerCase();
}

export function stripExt(path: string): string {
  const name = basename(path);
  const dot = name.lastIndexOf('.');
  return dot <= 0 ? name : name.slice(0, dot);
}

/** "sprite.png" + "webp" -> "sprite.webp" */
export function replaceExt(path: string, ext: string): string {
  const clean = ext.startsWith('.') ? ext.slice(1) : ext;
  return `${stripExt(path)}.${clean}`;
}

/** Guarantees a unique name inside a batch (for ZIP entries). */
export function uniqueName(name: string, used: Set<string>): string {
  if (!used.has(name)) {
    used.add(name);
    return name;
  }
  const ext = extname(name);
  const base = stripExt(name);
  let i = 2;
  let candidate = `${base}-${i}${ext ? `.${ext}` : ''}`;
  while (used.has(candidate)) {
    i += 1;
    candidate = `${base}-${i}${ext ? `.${ext}` : ''}`;
  }
  used.add(candidate);
  return candidate;
}

/** Human-friendly file type from a MIME type or extension. */
export function fileKindLabel(type: string, name: string): string {
  if (type.startsWith('image/')) return type.replace('image/', '').toUpperCase();
  if (type.startsWith('audio/')) return type.replace('audio/', '').toUpperCase();
  if (type.startsWith('video/')) return type.replace('video/', '').toUpperCase();
  if (type.startsWith('font/')) return 'FONT';
  const ext = extname(name);
  return ext ? ext.toUpperCase() : 'FILE';
}

/** Natural sort so "frame_2" comes before "frame_10". */
export function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

export function sortByName<T>(items: T[], getName: (item: T) => string): T[] {
  return [...items].sort((a, b) => naturalCompare(getName(a), getName(b)));
}

export function truncateMiddle(text: string, max = 42): string {
  if (text.length <= max) return text;
  const head = Math.ceil((max - 1) / 2);
  const tail = Math.floor((max - 1) / 2);
  return `${text.slice(0, head)}…${text.slice(text.length - tail)}`;
}

/** Turns any string into a safe download filename. */
export function safeFileName(name: string, fallback = 'download'): string {
  const cleaned = name
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '');
  return cleaned || fallback;
}

/** Pads a frame index: 7 -> "007" */
export function padIndex(index: number, total: number): string {
  const width = Math.max(2, String(total - 1).length);
  return String(index).padStart(width, '0');
}

export function isPowerOfTwo(value: number): boolean {
  return value > 0 && (value & (value - 1)) === 0;
}

export function nextPowerOfTwo(value: number): number {
  if (value <= 1) return 1;
  return 2 ** Math.ceil(Math.log2(value));
}

export function gcd(a: number, b: number): number {
  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));
  while (y) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x || 1;
}

/** 1920x1080 -> "16:9" */
export function aspectRatio(width: number, height: number): string {
  const divisor = gcd(width, height);
  return `${Math.round(width / divisor)}:${Math.round(height / divisor)}`;
}

export function formatDateTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return 'just now';
  if (diff < hour) return `${Math.floor(diff / minute)}m ago`;
  if (diff < day) return `${Math.floor(diff / hour)}h ago`;
  if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`;
  return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

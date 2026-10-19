/**
 * File input/output helpers: reading user files, building downloads and
 * packaging results as ZIP archives. Everything runs in the browser.
 */
import { zip as fflateZip, unzipSync, strToU8 } from 'fflate';
import { safeFileName, uniqueName } from './format';
import { toUserMessage } from './errors';

export function readAsText(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error(`Could not read "${nameOf(file)}"`));
    reader.readAsText(file);
  });
}

export function readAsArrayBuffer(file: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(new Error(`Could not read "${nameOf(file)}"`));
    reader.readAsArrayBuffer(file);
  });
}

export function readAsDataURL(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error(`Could not read "${nameOf(file)}"`));
    reader.readAsDataURL(file);
  });
}

function nameOf(blob: Blob): string {
  return 'name' in blob ? String((blob as File).name) : 'file';
}

/** Triggers a browser download for a blob. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = safeFileName(filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoke on the next frame so the download has a chance to start.
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function downloadText(text: string, filename: string, mime = 'text/plain'): void {
  downloadBlob(new Blob([text], { type: `${mime};charset=utf-8` }), filename);
}

export function downloadDataUrl(dataUrl: string, filename: string): void {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = safeFileName(filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export interface ZipEntry {
  name: string;
  data: Blob | Uint8Array | string;
}

/**
 * Packages results into a ZIP. Uses STORE for already-compressed payloads
 * (images, audio, models) and DEFLATE for text, which matches what users
 * expect from a "download all" button.
 */
export async function zipFiles(
  entries: ZipEntry[],
  onProgress?: (ratio: number) => void,
): Promise<Blob> {
  const files: Record<string, Uint8Array> = {};
  const used = new Set<string>();

  for (const entry of entries) {
    const name = uniqueName(safeFileName(entry.name), used);
    if (typeof entry.data === 'string') {
      files[name] = strToU8(entry.data);
    } else if (entry.data instanceof Uint8Array) {
      files[name] = entry.data;
    } else {
      files[name] = new Uint8Array(await entry.data.arrayBuffer());
    }
  }

  return new Promise<Blob>((resolve, reject) => {
    fflateZip(files, { level: 6 }, (err, data) => {
      if (err) {
        reject(new Error(toUserMessage(err)));
        return;
      }
      onProgress?.(1);
      resolve(new Blob([data as BlobPart], { type: 'application/zip' }));
    });
  });
}

export interface UnzippedEntry {
  name: string;
  data: Uint8Array;
}

export async function unzipFile(file: Blob): Promise<UnzippedEntry[]> {
  const buffer = new Uint8Array(await file.arrayBuffer());
  const result = unzipSync(buffer);
  return Object.entries(result)
    .filter(([name]) => !name.endsWith('/'))
    .map(([name, data]) => ({ name, data }));
}

/** Picks files from a DataTransfer, coping with dropped folders. */
export function filesFromDataTransfer(dt: DataTransfer): File[] {
  const files: File[] = [];
  if (dt.items && dt.items.length) {
    for (const item of Array.from(dt.items)) {
      if (item.kind !== 'file') continue;
      const file = item.getAsFile();
      if (file) files.push(file);
    }
    return files;
  }
  return Array.from(dt.files ?? []);
}

/** Accept-attribute matcher: "image/*,.png" against a real File. */
export function matchesAccept(file: File, accept?: string): boolean {
  if (!accept) return true;
  const patterns = accept
    .split(',')
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);
  if (!patterns.length) return true;
  const name = file.name.toLowerCase();
  const type = (file.type || '').toLowerCase();
  return patterns.some((pattern) => {
    if (pattern.startsWith('.')) return name.endsWith(pattern);
    if (pattern.endsWith('/*')) return type.startsWith(pattern.slice(0, -1));
    return type === pattern;
  });
}

export function filterByAccept(files: File[], accept?: string): { accepted: File[]; rejected: File[] } {
  const accepted: File[] = [];
  const rejected: File[] = [];
  for (const file of files) {
    if (matchesAccept(file, accept)) accepted.push(file);
    else rejected.push(file);
  }
  return { accepted, rejected };
}

/** Creates object URLs for a list of blobs and revokes them when replaced. */
export class ObjectUrlCache {
  private urls = new Map<string, string>();

  get(key: string, blob: Blob): string {
    const existing = this.urls.get(key);
    if (existing) return existing;
    const url = URL.createObjectURL(blob);
    this.urls.set(key, url);
    return url;
  }

  revoke(key: string): void {
    const url = this.urls.get(key);
    if (url) {
      URL.revokeObjectURL(url);
      this.urls.delete(key);
    }
  }

  clear(): void {
    for (const url of this.urls.values()) URL.revokeObjectURL(url);
    this.urls.clear();
  }
}

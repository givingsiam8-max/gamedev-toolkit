/** Shared RFC 4180 CSV helpers for the data tools. */

export type Table = string[][];

export const CSV_DELIMITERS = [',', ';', '\t', '|'] as const;

/**
 * RFC 4180 parser: quoted fields, doubled quotes ("") as escapes,
 * and embedded delimiters or newlines inside quotes.
 */
export function parseCsv(text: string, delimiter: string): Table {
  const rows: Table = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"' && field === '') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Picks the delimiter that yields the most consistent column count on the first lines. */
export function detectDelimiter(text: string): string {
  const sample = text.split(/\r?\n/).slice(0, 20).join('\n');
  let best = ',';
  let bestScore = -1;
  for (const d of CSV_DELIMITERS) {
    const rows = parseCsv(sample, d).filter((r) => r.length > 0);
    if (rows.length === 0) continue;
    const widths = rows.map((r) => r.length).sort((a, b) => a - b);
    const mode = widths[Math.floor(widths.length / 2)];
    const consistent = widths.filter((w) => w === mode).length;
    const score = mode > 1 ? consistent * 10 + mode : 0;
    if (score > bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return best;
}

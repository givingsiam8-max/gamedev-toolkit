import type { CSSProperties } from 'react';
import { ACCENT_COLORS, type AccentKey } from '../core/types';

/**
 * Exposes a category accent to CSS as `--cat-color`, which the shared styles
 * use for icons, active states and highlights.
 */
export function accentStyle(accent: AccentKey | undefined): CSSProperties {
  const color = accent ? ACCENT_COLORS[accent] : ACCENT_COLORS.blue;
  return { '--cat-color': color } as CSSProperties;
}

export function accentColor(accent: AccentKey | undefined): string {
  return accent ? ACCENT_COLORS[accent] : ACCENT_COLORS.blue;
}

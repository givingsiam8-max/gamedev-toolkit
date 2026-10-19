/**
 * Core contracts for the modular tool architecture.
 *
 * Every tool is an independent module: it declares its own metadata and
 * lazy-loads its implementation. Navigation, search, the dashboard and the
 * workspace shell are all generated from these declarations, so new tools can
 * be added without touching the app shell.
 */
import type { ComponentType } from 'react';
import type { LucideIcon } from 'lucide-react';

/** Accent palette keys — resolved to `--cat-color` CSS variables. */
export type AccentKey =
  | 'blue'
  | 'violet'
  | 'cyan'
  | 'emerald'
  | 'amber'
  | 'rose'
  | 'orange'
  | 'teal'
  | 'indigo'
  | 'lime'
  | 'pink'
  | 'sky'
  | 'fuchsia'
  | 'green'
  | 'slate'
  | 'red'
  | 'yellow';

export const ACCENT_COLORS: Record<AccentKey, string> = {
  blue: '#3b82f6',
  violet: '#8b5cf6',
  cyan: '#06b6d4',
  emerald: '#10b981',
  amber: '#f59e0b',
  rose: '#f43f5e',
  orange: '#f97316',
  teal: '#14b8a6',
  indigo: '#6366f1',
  lime: '#84cc16',
  pink: '#ec4899',
  sky: '#0ea5e9',
  fuchsia: '#d946ef',
  green: '#22c55e',
  slate: '#64748b',
  red: '#ef4444',
  yellow: '#eab308',
};

export interface SubcategoryDefinition {
  id: string;
  name: string;
}

export interface CategoryDefinition {
  id: string;
  name: string;
  /** Short one-liner shown on the dashboard and empty states. */
  description: string;
  icon: LucideIcon;
  accent: AccentKey;
  subcategories: SubcategoryDefinition[];
}

/** A tool component receives no props: it owns its own state and layout. */
export interface ToolModule {
  default: ComponentType;
}

export interface ToolDefinition {
  /** Globally unique kebab-case id. Also used for favorites/recent storage. */
  id: string;
  name: string;
  category: string;
  subcategory: string;
  /** One short sentence. Shown on cards and in the tool header. */
  description: string;
  /** Extra search terms: file formats, synonyms, abbreviations. */
  keywords: string[];
  /** Human-readable supported formats, e.g. ['PNG', 'JPG', 'WebP']. */
  formats?: string[];
  icon: LucideIcon;
  /**
   * True when all processing happens in the browser (default).
   * Set to false only for genuinely remote work, and label it in the UI.
   */
  local?: boolean;
  badge?: 'new' | 'beta';
  /** Lazy module loader so heavy libraries load only when the tool is opened. */
  load: () => Promise<ToolModule>;
}

export interface CategoryModule {
  category: CategoryDefinition;
  tools: ToolDefinition[];
}

export interface SearchHit {
  tool: ToolDefinition;
  score: number;
}

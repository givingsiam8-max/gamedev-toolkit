/**
 * Chrome context: lets a tool render the shared workspace without knowing how
 * navigation or favorites work. Provided by the tool route, consumed by
 * `ToolShell`.
 */
import { createContext, useContext, type ReactNode } from 'react';
import type { ToolDefinition } from '../core/types';

export interface ToolChrome {
  tool: ToolDefinition;
  onBack?: () => void;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
}

const ToolChromeContext = createContext<ToolChrome | null>(null);

export function ToolChromeProvider({ value, children }: { value: ToolChrome; children: ReactNode }) {
  return <ToolChromeContext.Provider value={value}>{children}</ToolChromeContext.Provider>;
}

export function useToolChrome(): ToolChrome | null {
  return useContext(ToolChromeContext);
}

/** The current tool's definition (name, formats, icon…), or null outside a tool route. */
export function useCurrentTool(): ToolDefinition | null {
  return useContext(ToolChromeContext)?.tool ?? null;
}

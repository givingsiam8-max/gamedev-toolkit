/**
 * Local preferences: theme, sidebar state, favorites, recents and usage
 * counts. Stored in localStorage — no account, no server.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type ThemeName = 'dark' | 'midnight' | 'light';

export interface Settings {
  theme: ThemeName;
  sidebarCollapsed: boolean;
  showCardFormats: boolean;
  confirmLargeFiles: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'dark',
  sidebarCollapsed: false,
  showCardFormats: true,
  confirmLargeFiles: true,
};

const KEYS = {
  settings: 'gdt.settings',
  favorites: 'gdt.favorites',
  recent: 'gdt.recent',
  usage: 'gdt.usage',
} as const;

const MAX_RECENT = 12;

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage disabled or full — preferences simply won't persist */
  }
}

interface AppStateValue {
  settings: Settings;
  favorites: string[];
  recent: string[];
  usage: Record<string, number>;
  setSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  resetSettings: () => void;
  isFavorite: (toolId: string) => boolean;
  toggleFavorite: (toolId: string) => void;
  clearFavorites: () => void;
  recordRun: (toolId: string) => void;
  clearRecent: () => void;
  clearUsage: () => void;
  resetAll: () => void;
  usageCount: (toolId: string) => number;
}

const AppStateContext = createContext<AppStateValue | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(() => ({
    ...DEFAULT_SETTINGS,
    ...readJson<Partial<Settings>>(KEYS.settings, {}),
  }));
  const [favorites, setFavorites] = useState<string[]>(() => readJson<string[]>(KEYS.favorites, []));
  const [recent, setRecent] = useState<string[]>(() => readJson<string[]>(KEYS.recent, []));
  const [usage, setUsage] = useState<Record<string, number>>(() =>
    readJson<Record<string, number>>(KEYS.usage, {}),
  );

  useEffect(() => {
    writeJson(KEYS.settings, settings);
    document.documentElement.dataset.theme = settings.theme;
  }, [settings]);

  useEffect(() => {
    writeJson(KEYS.favorites, favorites);
  }, [favorites]);

  useEffect(() => {
    writeJson(KEYS.recent, recent);
  }, [recent]);

  useEffect(() => {
    writeJson(KEYS.usage, usage);
  }, [usage]);

  const setSetting = useCallback(<K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }, []);

  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
  }, []);

  const toggleFavorite = useCallback((toolId: string) => {
    setFavorites((prev) =>
      prev.includes(toolId) ? prev.filter((id) => id !== toolId) : [toolId, ...prev],
    );
  }, []);

  const isFavorite = useCallback((toolId: string) => favorites.includes(toolId), [favorites]);

  const clearFavorites = useCallback(() => setFavorites([]), []);

  const recordRun = useCallback((toolId: string) => {
    setRecent((prev) => [toolId, ...prev.filter((id) => id !== toolId)].slice(0, MAX_RECENT));
    setUsage((prev) => ({ ...prev, [toolId]: (prev[toolId] ?? 0) + 1 }));
  }, []);

  const clearRecent = useCallback(() => setRecent([]), []);

  const clearUsage = useCallback(() => setUsage({}), []);

  const resetAll = useCallback(() => {
    setFavorites([]);
    setRecent([]);
    setUsage({});
    setSettings(DEFAULT_SETTINGS);
  }, []);

  const usageCount = useCallback((toolId: string) => usage[toolId] ?? 0, [usage]);

  const value = useMemo<AppStateValue>(
    () => ({
      settings,
      favorites,
      recent,
      usage,
      setSetting,
      resetSettings,
      isFavorite,
      toggleFavorite,
      clearFavorites,
      recordRun,
      clearRecent,
      clearUsage,
      resetAll,
      usageCount,
    }),
    [
      settings,
      favorites,
      recent,
      usage,
      setSetting,
      resetSettings,
      isFavorite,
      toggleFavorite,
      clearFavorites,
      recordRun,
      clearRecent,
      clearUsage,
      resetAll,
      usageCount,
    ],
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState(): AppStateValue {
  const context = useContext(AppStateContext);
  if (!context) throw new Error('useAppState must be used inside <AppStateProvider>');
  return context;
}

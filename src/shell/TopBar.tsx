import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Clock,
  Heart,
  Menu,
  Monitor,
  Moon,
  Search,
  Settings,
  Sun,
  X,
} from 'lucide-react';
import { getCategory, getTool, getToolCount, searchTools } from '../core/registry';
import { useAppState, type ThemeName } from '../core/store';
import type { Route } from '../core/router';
import { accentStyle } from '../components/accent';
import { useDebounced } from '../core/hooks';
import { Button, IconButton } from '../components/ui';

const THEME_ORDER: ThemeName[] = ['dark', 'midnight', 'light'];

export function TopBar({
  route,
  onNavigate,
  onOpenSettings,
  onOpenMobileNav,
  focusSearchSignal = 0,
}: {
  route: Route;
  onNavigate: (route: Route) => void;
  onOpenSettings: () => void;
  onOpenMobileNav: () => void;
  focusSearchSignal?: number;
}) {
  const { settings, setSetting, favorites, recent } = useAppState();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const debounced = useDebounced(query, 120);
  const hits = useMemo(() => (debounced.trim() ? searchTools(debounced, 12) : []), [debounced]);
  const recentTools = useMemo(
    () =>
      recent
        .slice(0, 4)
        .map((id) => getTool(id))
        .filter((tool): tool is NonNullable<typeof tool> => Boolean(tool)),
    [recent],
  );

  const showPop = open && (debounced.trim().length > 0 || recentTools.length > 0);
  const results = debounced.trim() ? hits.map((hit) => hit.tool) : recentTools;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
        setOpen(true);
      }
      if (event.key === 'Escape') {
        setOpen(false);
        inputRef.current?.blur();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    const onClickOutside = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  useEffect(() => {
    setHighlight(0);
  }, [debounced]);

  useEffect(() => {
    if (focusSearchSignal <= 0) return;
    inputRef.current?.focus();
    setOpen(true);
  }, [focusSearchSignal]);

  const openTool = (toolId: string) => {
    onNavigate({ name: 'tool', toolId });
    setOpen(false);
    setQuery('');
    inputRef.current?.blur();
  };

  const submitSearch = () => {
    const term = (debounced || query).trim();
    if (!term) return;
    const exact = searchTools(term, 1)[0];
    if (exact) openTool(exact.tool.id);
    else onNavigate({ name: 'search', query: term });
    setOpen(false);
  };

  const nextTheme = () => {
    const index = THEME_ORDER.indexOf(settings.theme);
    setSetting('theme', THEME_ORDER[(index + 1) % THEME_ORDER.length]);
  };

  const ThemeIcon = settings.theme === 'light' ? Sun : settings.theme === 'midnight' ? Moon : Monitor;

  return (
    <header className="topbar">
      <IconButton
        label="Show categories"
        icon={<Menu />}
        onClick={onOpenMobileNav}
        className="mobile-only"
      />

      <div className="search-wrap" ref={wrapRef}>
        <Search className="search-icon" />
        <input
          ref={inputRef}
          className="search-input"
          type="search"
          placeholder="Search tools… try FBX, PNG, texture, JSON"
          value={query}
          aria-label="Search tools"
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setHighlight((prev) => Math.min(prev + 1, results.length - 1));
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              setHighlight((prev) => Math.max(prev - 1, 0));
            } else if (event.key === 'Enter') {
              event.preventDefault();
              const picked = results[highlight];
              if (picked) openTool(picked.id);
              else submitSearch();
            }
          }}
        />
        {query ? (
          <button
            type="button"
            className="btn btn-ghost btn-sm btn-icon"
            style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)' }}
            aria-label="Clear search"
            onClick={() => {
              setQuery('');
              inputRef.current?.focus();
            }}
          >
            <X />
          </button>
        ) : (
          <span className="search-kbd">
            <kbd className="kbd">Ctrl</kbd>
            <kbd className="kbd">K</kbd>
          </span>
        )}

        {showPop && (
          <div className="search-pop">
            {results.length === 0 ? (
              <div className="search-empty">
                <div className="strong" style={{ color: 'var(--text-1)' }}>
                  No tools match “{debounced}”
                </div>
                <div style={{ marginTop: 6 }}>
                  Try a file format such as <strong>PNG</strong>, <strong>FBX</strong> or a task like{' '}
                  <strong>compress</strong>.
                </div>
              </div>
            ) : (
              <>
                <div className="search-group-label">
                  {debounced.trim() ? `${results.length} matching tools` : 'Recently used'}
                </div>
                {results.map((tool, index) => {
                  const Icon = tool.icon;
                  const category = getCategory(tool.category);
                  return (
                    <button
                      key={tool.id}
                      type="button"
                      className={`search-item ${index === highlight ? 'search-item-active' : ''}`}
                      style={accentStyle(category?.accent)}
                      onMouseEnter={() => setHighlight(index)}
                      onClick={() => openTool(tool.id)}
                    >
                      <span className="search-item-icon">
                        <Icon />
                      </span>
                      <span className="grow" style={{ minWidth: 0 }}>
                        <div className="row" style={{ gap: 8 }}>
                          <span className="strong">{tool.name}</span>
                          <span className="dim xs">{category?.name}</span>
                        </div>
                        <div className="tiny dim truncate">{tool.description}</div>
                      </span>
                    </button>
                  );
                })}
                {debounced.trim() && (
                  <div style={{ padding: 8 }}>
                    <Button size="sm" variant="outline" block icon={<Search />} onClick={submitSearch}>
                      Search all results for “{debounced}”
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <div className="topbar-actions">
        <span className="dim tiny nowrap hide-sm">{getToolCount()} tools · 100% local</span>
        <IconButton
          label={`Theme: ${settings.theme} (click to change)`}
          icon={<ThemeIcon />}
          onClick={nextTheme}
        />
        <button
          type="button"
          className={`topbar-btn ${route.name === 'favorites' ? 'topbar-btn-active' : ''}`}
          onClick={() => onNavigate({ name: 'favorites' })}
          title="Favorites"
        >
          <Heart />
          <span className="hide-sm">Favorites</span>
          {favorites.length > 0 && <span className="count-dot">{favorites.length}</span>}
        </button>
        <button
          type="button"
          className={`topbar-btn ${route.name === 'recent' ? 'topbar-btn-active' : ''}`}
          onClick={() => onNavigate({ name: 'recent' })}
          title="Recently used tools"
        >
          <Clock />
          <span className="hide-sm">Recent</span>
        </button>
        <IconButton label="Settings" icon={<Settings />} onClick={onOpenSettings} />
      </div>
    </header>
  );
}

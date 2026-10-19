import { useCallback, useEffect, useRef, useState } from 'react';
import { AppStateProvider, useAppState } from './core/store';
import { ToastProvider } from './components/ui';
import { navigate, useRoute, type Route } from './core/router';
import { getCategory, getTool } from './core/registry';
import { Sidebar } from './shell/Sidebar';
import { TopBar } from './shell/TopBar';
import { SettingsModal } from './shell/SettingsModal';
import { ToolView } from './shell/ToolView';
import {
  AllToolsView,
  CategoryView,
  Dashboard,
  FavoritesView,
  RecentView,
  SearchView,
  SubcategoryBar,
} from './shell/views';
import { ErrorBoundary } from './components/ErrorBoundary';

export function App() {
  return (
    <AppStateProvider>
      <ToastProvider>
        <Shell />
      </ToastProvider>
    </AppStateProvider>
  );
}

function Shell() {
  const route = useRoute();
  const { settings } = useAppState();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [focusSearchSignal, setFocusSearchSignal] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);

  const go = useCallback((next: Route) => {
    navigate(next);
    setMobileNavOpen(false);
  }, []);

  const openTool = useCallback((toolId: string) => go({ name: 'tool', toolId }), [go]);
  const openCategory = useCallback(
    (categoryId: string) => go({ name: 'category', categoryId }),
    [go],
  );

  // Reset scroll when the route changes — a new tool should start at the top.
  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0 });
  }, [route]);

  const activeCategory = route.name === 'category' ? getCategory(route.categoryId) : undefined;

  return (
    <div className={`app ${settings.sidebarCollapsed ? 'app-sidebar-collapsed' : ''}`}>
      <Sidebar
        route={route}
        onSelectHome={() => go({ name: 'home' })}
        onSelectCategory={openCategory}
        onSelectFavorites={() => go({ name: 'favorites' })}
        onSelectRecent={() => go({ name: 'recent' })}
        onOpenSettings={() => setSettingsOpen(true)}
        mobileOpen={mobileNavOpen}
      />

      <div className="main">
        <TopBar
          route={route}
          onNavigate={go}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenMobileNav={() => setMobileNavOpen((prev) => !prev)}
          focusSearchSignal={focusSearchSignal}
        />

        {activeCategory && (
          <SubcategoryBar
            category={activeCategory}
            activeSubcategory={route.name === 'category' ? route.subcategoryId : undefined}
            onSelect={(subcategoryId) =>
              go({ name: 'category', categoryId: activeCategory.id, subcategoryId })
            }
          />
        )}

        <main className="content" ref={contentRef}>
          <ErrorBoundary scope="This view">
            {route.name === 'home' && (
              <Dashboard
                onOpenTool={openTool}
                onBrowseCategory={openCategory}
                onFocusSearch={() => setFocusSearchSignal((value) => value + 1)}
                onShowAll={() => go({ name: 'search', query: '' })}
              />
            )}

            {route.name === 'category' && (
              <CategoryView
                categoryId={route.categoryId}
                subcategoryId={route.subcategoryId}
                onOpenTool={openTool}
                onSelectSubcategory={(subcategoryId) =>
                  go({ name: 'category', categoryId: route.categoryId, subcategoryId })
                }
              />
            )}

            {route.name === 'tool' && (
              <ToolView
                toolId={route.toolId}
                onBack={() => {
                  const tool = getTool(route.toolId);
                  if (tool && getCategory(tool.category)) {
                    go({ name: 'category', categoryId: tool.category });
                  } else {
                    go({ name: 'home' });
                  }
                }}
                onOpenTool={openTool}
              />
            )}

            {route.name === 'favorites' && <FavoritesView onOpenTool={openTool} />}
            {route.name === 'recent' && <RecentView onOpenTool={openTool} />}
            {route.name === 'search' && route.query === '' && <AllToolsView onOpenTool={openTool} />}
            {route.name === 'search' && route.query !== '' && (
              <SearchView query={route.query} onOpenTool={openTool} />
            )}
          </ErrorBoundary>
        </main>
      </div>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}

import { Heart, History, Home, PanelLeftClose, PanelLeftOpen, Settings } from 'lucide-react';
import { getCategories, getTool, getToolsByCategory } from '../core/registry';
import { useAppState } from '../core/store';
import type { Route } from '../core/router';
import { accentStyle } from '../components/accent';

export function Sidebar({
  route,
  onSelectCategory,
  onSelectHome,
  onSelectFavorites,
  onSelectRecent,
  onOpenSettings,
  mobileOpen,
}: {
  route: Route;
  onSelectCategory: (categoryId: string) => void;
  onSelectHome: () => void;
  onSelectFavorites: () => void;
  onSelectRecent: () => void;
  onOpenSettings: () => void;
  mobileOpen: boolean;
}) {
  const { settings, setSetting, favorites, recent } = useAppState();
  const collapsed = settings.sidebarCollapsed;
  const categories = getCategories();
  const activeCategory = route.name === 'category' ? route.categoryId : undefined;

  return (
    <nav className={`sidebar ${collapsed ? 'sidebar-collapsed' : ''} ${mobileOpen ? 'sidebar-open' : ''}`}>
      <div className="brand" onClick={onSelectHome} title="GameDev Toolkit — home">
        <span className="brand-mark">
          <img src="./logo-mark.svg" alt="" width={20} height={20} />
        </span>
        <span className="brand-text">
          <span className="brand-name">GameDev Toolkit</span>
          <span className="brand-sub">All-in-one workspace</span>
        </span>
      </div>

      <div className="sidebar-scroll">
        <button
          type="button"
          className={`cat-btn ${route.name === 'home' ? 'cat-btn-active' : ''}`}
          onClick={onSelectHome}
          title="Dashboard"
        >
          <span className="cat-icon" style={accentStyle('blue')}>
            <Home />
          </span>
          <span className="cat-name">Dashboard</span>
        </button>

        <div className="nav-label">Categories</div>

        {categories.map((category) => {
          const Icon = category.icon;
          const count = getToolsByCategory(category.id).length;
          const active = activeCategory === category.id || isToolInCategory(route, category.id);
          return (
            <button
              key={category.id}
              type="button"
              className={`cat-btn ${active ? 'cat-btn-active' : ''}`}
              style={accentStyle(category.accent)}
              onClick={() => onSelectCategory(category.id)}
              title={`${category.name} — ${count} tools`}
            >
              <span className="cat-icon">
                <Icon />
              </span>
              <span className="cat-name">{category.name}</span>
              <span className="cat-count">{count}</span>
            </button>
          );
        })}

        <div className="nav-label">Your tools</div>
        <button
          type="button"
          className={`cat-btn ${route.name === 'favorites' ? 'cat-btn-active' : ''}`}
          style={accentStyle('amber')}
          onClick={onSelectFavorites}
          title="Favorites"
        >
          <span className="cat-icon">
            <Heart />
          </span>
          <span className="cat-name">Favorites</span>
          <span className="cat-count">{favorites.length}</span>
        </button>
        <button
          type="button"
          className={`cat-btn ${route.name === 'recent' ? 'cat-btn-active' : ''}`}
          style={accentStyle('cyan')}
          onClick={onSelectRecent}
          title="Recently used"
        >
          <span className="cat-icon">
            <History />
          </span>
          <span className="cat-name">Recent</span>
          <span className="cat-count">{recent.length}</span>
        </button>
      </div>

      <div className="sidebar-foot">
        <button type="button" className="cat-btn" onClick={onOpenSettings} title="Settings">
          <span className="cat-icon">
            <Settings />
          </span>
          <span className="cat-name">Settings</span>
        </button>
        <button
          type="button"
          className="cat-btn"
          onClick={() => setSetting('sidebarCollapsed', !collapsed)}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <span className="cat-icon">
            {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
          </span>
          <span className="cat-name">Collapse</span>
        </button>
      </div>
    </nav>
  );
}

function isToolInCategory(route: Route, categoryId: string): boolean {
  if (route.name !== 'tool') return false;
  return getTool(route.toolId)?.category === categoryId;
}

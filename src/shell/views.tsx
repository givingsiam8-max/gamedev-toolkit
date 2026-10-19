import { useMemo, useState } from 'react';
import {
  ArrowRight,
  Clock,
  Compass,
  Heart,
  LayoutGrid,
  Lightbulb,
  Search,
  Sparkles,
  Star,
  Zap,
} from 'lucide-react';
import {
  getAllTools,
  getCategories,
  getCategory,
  getTool,
  getToolCount,
  getToolsByCategory,
  getToolsBySubcategory,
  popularTools,
  relatedTools,
  searchTools,
} from '../core/registry';
import { useAppState } from '../core/store';
import type { CategoryDefinition, ToolDefinition } from '../core/types';
import { accentStyle } from '../components/accent';
import { ToolGrid } from '../components/ToolCard';
import { Badge, Button, EmptyState, Field, Select } from '../components/ui';
import { formatRelativeTime } from '../core/format';

/* ==========================================================================
   Dashboard
   ========================================================================== */

export function Dashboard({
  onOpenTool,
  onBrowseCategory,
  onFocusSearch,
  onShowAll,
}: {
  onOpenTool: (toolId: string) => void;
  onBrowseCategory: (categoryId: string) => void;
  onFocusSearch: () => void;
  onShowAll: () => void;
}) {
  const { favorites, recent, isFavorite, toggleFavorite, usage } = useAppState();
  const categories = getCategories();

  const recentTools = useMemo(
    () =>
      recent
        .map((id) => getTool(id))
        .filter((tool): tool is ToolDefinition => Boolean(tool)),
    [recent],
  );

  const favoriteTools = useMemo(
    () => favorites.map((id) => getTool(id)).filter((tool): tool is ToolDefinition => Boolean(tool)),
    [favorites],
  );

  const mostUsed = useMemo(
    () =>
      Object.entries(usage)
        .sort((a, b) => b[1] - a[1])
        .map(([id]) => getTool(id))
        .filter((tool): tool is ToolDefinition => Boolean(tool))
        .slice(0, 6),
    [usage],
  );

  const quickTools = useMemo(() => popularTools(13), []);

  const recommended = useMemo(() => {
    const anchor = recentTools[0] ?? recentTools[1];
    if (!anchor) return [];
    return relatedTools(anchor.id, 4);
  }, [recentTools]);

  return (
    <div className="content-inner">
      <section className="hero">
        <h1 className="hero-title">
          GameDev <span>Toolkit</span>
        </h1>
        <p className="hero-text">
          One workspace for game development assets, images, textures, 3D models, colours, materials
          and developer utilities. Find a tool in seconds, process your files, download the result —
          everything runs locally in your browser.
        </p>
        <div className="hero-actions">
          <Button variant="primary" size="lg" icon={<LayoutGrid />} onClick={onShowAll}>
            Explore tools
          </Button>
          <Button variant="secondary" size="lg" icon={<Search />} onClick={onFocusSearch}>
            Search tools
          </Button>
        </div>
        <div className="hero-stats">
          <div className="hero-stat">
            <span className="hero-stat-value">{getToolCount()}</span>
            <span className="hero-stat-label">Tools</span>
          </div>
          <div className="hero-stat">
            <span className="hero-stat-value">{categories.length}</span>
            <span className="hero-stat-label">Categories</span>
          </div>
          <div className="hero-stat">
            <span className="hero-stat-value">0</span>
            <span className="hero-stat-label">Files uploaded</span>
          </div>
          <div className="hero-stat">
            <span className="hero-stat-value">100%</span>
            <span className="hero-stat-label">Local processing</span>
          </div>
        </div>
      </section>

      <section className="dash-section">
        <div className="dash-head">
          <h2>
            <Zap />
            Quick tools
          </h2>
          <Button size="sm" variant="ghost" iconRight={<ArrowRight />} onClick={onShowAll}>
            All tools
          </Button>
        </div>
        <ToolGrid
          tools={quickTools}
          onOpen={onOpenTool}
          isFavorite={isFavorite}
          onToggleFavorite={toggleFavorite}
        />
      </section>

      {recentTools.length > 0 && (
        <section className="dash-section">
          <div className="dash-head">
            <h2>
              <Clock />
              Recently used
            </h2>
            <Badge>{recentTools.length}</Badge>
          </div>
          <ToolGrid
            tools={recentTools}
            onOpen={onOpenTool}
            isFavorite={isFavorite}
            onToggleFavorite={toggleFavorite}
          />
        </section>
      )}

      {recommended.length > 0 && (
        <section className="dash-section">
          <div className="dash-head">
            <h2>
              <Lightbulb />
              You may also need
            </h2>
            <span className="dim tiny">Based on your last tool</span>
          </div>
          <ToolGrid
            tools={recommended}
            onOpen={onOpenTool}
            isFavorite={isFavorite}
            onToggleFavorite={toggleFavorite}
          />
        </section>
      )}

      {favoriteTools.length > 0 && (
        <section className="dash-section">
          <div className="dash-head">
            <h2>
              <Heart />
              Favorites
            </h2>
            <Badge>{favoriteTools.length}</Badge>
          </div>
          <ToolGrid
            tools={favoriteTools}
            onOpen={onOpenTool}
            isFavorite={isFavorite}
            onToggleFavorite={toggleFavorite}
          />
        </section>
      )}

      {mostUsed.length > 0 && (
        <section className="dash-section">
          <div className="dash-head">
            <h2>
              <Star />
              Most used
            </h2>
          </div>
          <ToolGrid
            tools={mostUsed}
            onOpen={onOpenTool}
            isFavorite={isFavorite}
            onToggleFavorite={toggleFavorite}
          />
        </section>
      )}

      <section className="dash-section">
        <div className="dash-head">
          <h2>
            <Compass />
            Browse by category
          </h2>
        </div>
        <div className="tool-grid">
          {categories.map((category) => (
            <CategoryCard
              key={category.id}
              category={category}
              onOpen={() => onBrowseCategory(category.id)}
            />
          ))}
        </div>
      </section>

      <Notice2 />
    </div>
  );
}

function Notice2() {
  return (
    <div className="notice notice-info" style={{ marginBottom: 24 }}>
      <Sparkles style={{ width: 17, height: 17 }} />
      <div>
        <div className="notice-title">More tools keep coming</div>
        Because every tool is an independent module, new categories — AI helpers, Unreal and Godot
        utilities, build analysis — plug into the same workspace without changing the interface.
      </div>
    </div>
  );
}

function CategoryCard({
  category,
  onOpen,
}: {
  category: CategoryDefinition;
  onOpen: () => void;
}) {
  const Icon = category.icon;
  const count = getToolsByCategory(category.id).length;
  return (
    <div className="tool-card" style={accentStyle(category.accent)} role="button" tabIndex={0} onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen();
        }
      }}
    >
      <div className="tool-card-top">
        <span className="tool-card-icon">
          <Icon />
        </span>
        <div className="grow">
          <div className="tool-card-name">{category.name}</div>
          <div className="tool-card-cat">{count} tools</div>
        </div>
      </div>
      <p className="tool-card-desc">{category.description}</p>
    </div>
  );
}

/* ==========================================================================
   Subcategory bar
   ========================================================================== */

export function SubcategoryBar({
  category,
  activeSubcategory,
  onSelect,
}: {
  category: CategoryDefinition;
  activeSubcategory?: string;
  onSelect: (subcategoryId?: string) => void;
}) {
  const Icon = category.icon;
  const total = getToolsByCategory(category.id).length;

  return (
    <div className="subbar">
      <div className="subbar-crumb" style={accentStyle(category.accent)}>
        <span className="subbar-crumb-icon">
          <Icon />
        </span>
        <span className="subbar-crumb-name">{category.name}</span>
      </div>
      <button
        type="button"
        className={`chip ${!activeSubcategory ? 'chip-active' : ''}`}
        onClick={() => onSelect(undefined)}
      >
        All
        <span className="dim">{total}</span>
      </button>
      {category.subcategories.map((sub) => {
        const count = getToolsBySubcategory(category.id, sub.id).length;
        if (count === 0) return null;
        return (
          <button
            key={sub.id}
            type="button"
            className={`chip ${activeSubcategory === sub.id ? 'chip-active' : ''}`}
            onClick={() => onSelect(sub.id)}
          >
            {sub.name}
            <span className="dim">{count}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ==========================================================================
   Category view
   ========================================================================== */

export function CategoryView({
  categoryId,
  subcategoryId,
  onOpenTool,
  onSelectSubcategory,
}: {
  categoryId: string;
  subcategoryId?: string;
  onOpenTool: (toolId: string) => void;
  onSelectSubcategory: (subcategoryId?: string) => void;
}) {
  const { isFavorite, toggleFavorite } = useAppState();
  const category = getCategory(categoryId);

  const groups = useMemo(() => {
    if (!category) return [];
    const subs = subcategoryId
      ? category.subcategories.filter((sub) => sub.id === subcategoryId)
      : category.subcategories;
    return subs
      .map((sub) => ({
        sub,
        tools: getToolsBySubcategory(category.id, sub.id),
      }))
      .filter((group) => group.tools.length > 0);
  }, [category, subcategoryId]);

  if (!category) {
    return (
      <EmptyState
        icon={<Compass />}
        title="Category not found"
        text="That category does not exist. Pick another one from the sidebar."
      />
    );
  }

  const total = getToolsByCategory(category.id).length;
  if (total === 0) {
    return (
      <EmptyState
        icon={<Compass />}
        title={`${category.name} is being prepared`}
        text="No tools are registered in this category yet. The architecture is ready — tools can be added as independent modules at any time."
      />
    );
  }

  return (
    <div className="content-inner">
      <div className="dash-head" style={{ marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 'var(--fs-xl)' }}>{category.name}</h1>
          <p className="muted" style={{ marginTop: 4, maxWidth: 760 }}>
            {category.description}
          </p>
        </div>
        <div className="row">
          <Badge tone="accent">{total} tools</Badge>
          {subcategoryId && (
            <Button size="sm" variant="ghost" onClick={() => onSelectSubcategory(undefined)}>
              Show all
            </Button>
          )}
        </div>
      </div>

      {groups.map((group) => (
        <section key={group.sub.id} className="dash-section">
          <div className="dash-head">
            <h2 style={{ fontSize: 'var(--fs-md)' }}>{group.sub.name}</h2>
            <Badge>{group.tools.length}</Badge>
          </div>
          <ToolGrid
            tools={group.tools}
            onOpen={onOpenTool}
            isFavorite={isFavorite}
            onToggleFavorite={toggleFavorite}
          />
        </section>
      ))}
    </div>
  );
}

/* ==========================================================================
   All tools view
   ========================================================================== */

export function AllToolsView({ onOpenTool }: { onOpenTool: (toolId: string) => void }) {
  const { isFavorite, toggleFavorite, settings } = useAppState();
  const tools = getAllTools();
  const categories = getCategories();

  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState<'default' | 'name' | 'category'>('default');

  const visible = useMemo(() => {
    const list = filter === 'all' ? tools : tools.filter((tool) => tool.category === filter);
    const sorted = [...list];
    if (sort === 'name') sorted.sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === 'category') {
      sorted.sort(
        (a, b) =>
          (getCategory(a.category)?.name ?? '').localeCompare(getCategory(b.category)?.name ?? '') ||
          a.name.localeCompare(b.name),
      );
    }
    return sorted;
  }, [tools, filter, sort]);

  return (
    <div className="content-inner">
      <div className="dash-head" style={{ alignItems: 'flex-end' }}>
        <div>
          <h1 style={{ fontSize: 'var(--fs-xl)' }}>All tools</h1>
          <p className="muted" style={{ marginTop: 4 }}>
            Every registered module in the toolkit — {tools.length} tools across {categories.length}{' '}
            categories.
          </p>
        </div>
        <div className="row-wrap">
          <Field label="Category">
            <Select
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              options={[
                { value: 'all', label: 'All categories' },
                ...categories.map((category) => ({ value: category.id, label: category.name })),
              ]}
            />
          </Field>
          <Field label="Sort">
            <Select
              value={sort}
              onChange={(event) => setSort(event.target.value as 'default' | 'name' | 'category')}
              options={[
                { value: 'default', label: 'Recommended' },
                { value: 'name', label: 'Name (A–Z)' },
                { value: 'category', label: 'Category' },
              ]}
            />
          </Field>
        </div>
      </div>

      <ToolGrid
        tools={visible}
        onOpen={onOpenTool}
        isFavorite={isFavorite}
        onToggleFavorite={toggleFavorite}
        showFormats={settings.showCardFormats}
      />
    </div>
  );
}

/* ==========================================================================
   Favorites & recent
   ========================================================================== */

export function FavoritesView({ onOpenTool }: { onOpenTool: (toolId: string) => void }) {
  const { favorites, isFavorite, toggleFavorite, clearFavorites } = useAppState();
  const tools = favorites.map((id) => getTool(id)).filter((tool): tool is ToolDefinition => Boolean(tool));

  if (!tools.length) {
    return (
      <EmptyState
        icon={<Heart />}
        title="No favorites yet"
        text="Pin the tools you use every day and they will appear here and on the dashboard."
      />
    );
  }

  return (
    <div className="content-inner">
      <div className="dash-head">
        <h1 style={{ fontSize: 'var(--fs-xl)' }}>Favorites</h1>
        <Button size="sm" variant="ghost" onClick={clearFavorites}>
          Clear all
        </Button>
      </div>
      <ToolGrid tools={tools} onOpen={onOpenTool} isFavorite={isFavorite} onToggleFavorite={toggleFavorite} />
    </div>
  );
}

export function RecentView({ onOpenTool }: { onOpenTool: (toolId: string) => void }) {
  const { recent, isFavorite, toggleFavorite, clearRecent, usage } = useAppState();
  const tools = recent.map((id) => getTool(id)).filter((tool): tool is ToolDefinition => Boolean(tool));

  if (!tools.length) {
    return (
      <EmptyState
        icon={<Clock />}
        title="Nothing here yet"
        text="Tools you open are listed here so you can jump straight back to them."
      />
    );
  }

  return (
    <div className="content-inner">
      <div className="dash-head">
        <h1 style={{ fontSize: 'var(--fs-xl)' }}>Recently used</h1>
        <Button size="sm" variant="ghost" onClick={clearRecent}>
          Clear history
        </Button>
      </div>
      <ToolGrid tools={tools} onOpen={onOpenTool} isFavorite={isFavorite} onToggleFavorite={toggleFavorite} />
      <div className="stack-sm" style={{ marginTop: 26 }}>
        <div className="section-title">Usage counts</div>
        <div className="panel">
          <table className="table">
            <thead>
              <tr>
                <th>Tool</th>
                <th>Category</th>
                <th style={{ textAlign: 'right' }}>Runs</th>
              </tr>
            </thead>
            <tbody>
              {tools.map((tool) => (
                <tr key={tool.id}>
                  <td className="mono">{tool.name}</td>
                  <td>{getCategory(tool.category)?.name}</td>
                  <td style={{ textAlign: 'right' }} className="mono">
                    {usage[tool.id] ?? 0}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="dim tiny" style={{ marginTop: 10 }}>
        Most recent: {formatRelativeTime(Date.now())}
      </div>
    </div>
  );
}

/* ==========================================================================
   Search results
   ========================================================================== */

export function SearchView({
  query,
  onOpenTool,
}: {
  query: string;
  onOpenTool: (toolId: string) => void;
}) {
  const { isFavorite, toggleFavorite, recent } = useAppState();
  const results = useMemo(() => searchTools(query, 60).map((hit) => hit.tool), [query]);

  return (
    <div className="content-inner">
      <div className="dash-head">
        <div>
          <h1 style={{ fontSize: 'var(--fs-xl)' }}>
            {results.length} result{results.length === 1 ? '' : 's'} for “{query}”
          </h1>
          <p className="muted" style={{ marginTop: 4 }}>
            Searching tool names, categories, file formats and keywords.
          </p>
        </div>
      </div>
      {results.length ? (
        <ToolGrid tools={results} onOpen={onOpenTool} isFavorite={isFavorite} onToggleFavorite={toggleFavorite} />
      ) : (
        <EmptyState
          icon={<Search />}
          title="No tools matched"
          text={`Nothing matched “${query}”. Try a file format (PNG, FBX, GLB, JSON), a task (compress, resize, convert) or a category name.`}
          action={
            recent.length > 0 ? (
              <div className="stack-sm" style={{ marginTop: 8 }}>
                <div className="section-title">Try a recent tool</div>
                <ToolGrid
                  tools={recent
                    .slice(0, 4)
                    .map((id) => getTool(id))
                    .filter((tool): tool is ToolDefinition => Boolean(tool))}
                  onOpen={onOpenTool}
                  isFavorite={isFavorite}
                  onToggleFavorite={toggleFavorite}
                />
              </div>
            ) : undefined
          }
        />
      )}
    </div>
  );
}

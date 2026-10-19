import { Heart } from 'lucide-react';
import { getCategory } from '../core/registry';
import type { ToolDefinition } from '../core/types';
import { accentStyle } from './accent';

export function ToolCard({
  tool,
  onOpen,
  isFavorite = false,
  onToggleFavorite,
  showFormats = true,
  showCategory = true,
}: {
  tool: ToolDefinition;
  onOpen: (toolId: string) => void;
  isFavorite?: boolean;
  onToggleFavorite?: (toolId: string) => void;
  showFormats?: boolean;
  showCategory?: boolean;
}) {
  const Icon = tool.icon;
  const category = getCategory(tool.category);

  return (
    <div
      className="tool-card"
      style={accentStyle(category?.accent)}
      role="button"
      tabIndex={0}
      onClick={() => onOpen(tool.id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen(tool.id);
        }
      }}
    >
      <div className="tool-card-top">
        <span className="tool-card-icon">
          <Icon />
        </span>
        <div className="grow" style={{ paddingRight: 26 }}>
          <div className="tool-card-name">{tool.name}</div>
          {showCategory && <div className="tool-card-cat">{category?.name}</div>}
        </div>
      </div>

      <p className="tool-card-desc">{tool.description}</p>

      <div className="tool-card-foot">
        {showFormats &&
          (tool.formats ?? []).slice(0, 4).map((format) => (
            <span key={format} className="chip chip-format">
              {format}
            </span>
          ))}
        {tool.badge && <span className="badge badge-accent">{tool.badge === 'new' ? 'New' : 'Beta'}</span>}
      </div>

      {onToggleFavorite && (
        <button
          type="button"
          className={`tool-card-fav ${isFavorite ? 'tool-card-fav-on' : ''}`}
          aria-label={isFavorite ? `Remove ${tool.name} from favorites` : `Add ${tool.name} to favorites`}
          title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
          onClick={(event) => {
            event.stopPropagation();
            onToggleFavorite(tool.id);
          }}
        >
          <Heart fill={isFavorite ? 'currentColor' : 'none'} />
        </button>
      )}
    </div>
  );
}

export function ToolGrid({
  tools,
  onOpen,
  isFavorite,
  onToggleFavorite,
  showFormats = true,
  showCategory = true,
}: {
  tools: ToolDefinition[];
  onOpen: (toolId: string) => void;
  isFavorite?: (toolId: string) => boolean;
  onToggleFavorite?: (toolId: string) => void;
  showFormats?: boolean;
  showCategory?: boolean;
}) {
  return (
    <div className="tool-grid">
      {tools.map((tool) => (
        <ToolCard
          key={tool.id}
          tool={tool}
          onOpen={onOpen}
          isFavorite={isFavorite?.(tool.id) ?? false}
          onToggleFavorite={onToggleFavorite}
          showFormats={showFormats}
          showCategory={showCategory}
        />
      ))}
    </div>
  );
}

/**
 * The consistent tool workspace: header, main area, settings sidebar and the
 * sticky action bar. Tools render inside this shell; the current tool's
 * metadata and navigation come from `ToolChromeProvider`.
 */
import type { ReactNode } from 'react';
import { ArrowLeft, CircleCheck, Heart, Lock } from 'lucide-react';
import { ToolChromeProvider, useToolChrome } from '../shell/ToolChrome';
import type { ToolDefinition } from '../core/types';
import { accentStyle } from './accent';
import { ActionBar } from './files';
import { Badge, IconButton } from './ui';
import { formatNumber } from '../core/format';

export function ToolShell({
  tool: toolProp,
  children,
  sidebar,
  actions,
  info,
  sidebarTitle = 'Settings',
  full = false,
  sidebarFooter,
}: {
  /** Optional override; normally taken from the tool route context. */
  tool?: ToolDefinition;
  children: ReactNode;
  sidebar?: ReactNode;
  actions?: ReactNode;
  info?: ReactNode;
  sidebarTitle?: string;
  full?: boolean;
  sidebarFooter?: ReactNode;
}) {
  const chrome = useToolChrome();
  const tool = toolProp ?? chrome?.tool;

  if (!tool) {
    return (
      <div className="notice notice-error">
        This tool must be opened from the toolkit navigation.
      </div>
    );
  }

  return (
    <ToolWorkspace
      tool={tool}
      onBack={chrome?.onBack}
      isFavorite={chrome?.isFavorite}
      onToggleFavorite={chrome?.onToggleFavorite}
      sidebar={sidebar}
      actions={actions}
      info={info}
      sidebarTitle={sidebarTitle}
      full={full}
      sidebarFooter={sidebarFooter}
    >
      {children}
    </ToolWorkspace>
  );
}

function ToolWorkspace({
  tool,
  onBack,
  isFavorite,
  onToggleFavorite,
  children,
  sidebar,
  actions,
  info,
  sidebarTitle,
  full,
  sidebarFooter,
}: {
  tool: ToolDefinition;
  onBack?: () => void;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
  children: ReactNode;
  sidebar?: ReactNode;
  actions?: ReactNode;
  info?: ReactNode;
  sidebarTitle: string;
  full: boolean;
  sidebarFooter?: ReactNode;
}) {
  const Icon = tool.icon;
  const local = tool.local !== false;

  return (
    <ToolChromeProvider value={{ tool, onBack, isFavorite, onToggleFavorite }}>
      <div className="tool" style={accentStyle(undefined)}>
        <header className="tool-header">
          {onBack && <IconButton label="Back" className="tool-back" icon={<ArrowLeft />} onClick={onBack} />}
          <div className="tool-header-icon" style={accentStyle(undefined)}>
            <Icon />
          </div>
          <div className="grow">
            <div className="row">
              <h1 className="tool-title">{tool.name}</h1>
              {tool.badge && <Badge tone="accent">{tool.badge === 'new' ? 'New' : 'Beta'}</Badge>}
            </div>
            <p className="tool-desc">{tool.description}</p>
            <div className="tool-meta">
              {local ? (
                <span className="badge badge-local">
                  <Lock />
                  Processed locally in your browser
                </span>
              ) : (
                <span className="badge badge-warning">Uses a remote service</span>
              )}
              {(tool.formats ?? []).map((format) => (
                <span key={format} className="chip chip-format">
                  {format}
                </span>
              ))}
            </div>
          </div>
          {onToggleFavorite && (
            <IconButton
              label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
              icon={<Heart fill={isFavorite ? 'currentColor' : 'none'} />}
              variant={isFavorite ? 'secondary' : 'ghost'}
              style={isFavorite ? { color: 'var(--warning)' } : undefined}
              onClick={onToggleFavorite}
            />
          )}
        </header>

        <div className={full ? 'tool-grid-full' : 'tool-grid-layout'}>
          <div className="tool-main">{children}</div>
          {!full && sidebar && (
            <aside className="tool-side">
              <div className="panel">
                <header className="panel-header">
                  <h3 className="panel-title">{sidebarTitle}</h3>
                </header>
                <div className="panel-body stack">{sidebar}</div>
                {sidebarFooter && <footer className="panel-footer">{sidebarFooter}</footer>}
              </div>
            </aside>
          )}
        </div>

        {actions && <ActionBar info={info}>{actions}</ActionBar>}
      </div>
    </ToolChromeProvider>
  );
}

export { useCurrentTool, useToolChrome } from '../shell/ToolChrome';

/** Small key/value grid used for metadata readouts. */
export function MetaGrid({ rows }: { rows: Array<{ label: ReactNode; value: ReactNode }> }) {
  return (
    <div className="stack-sm">
      {rows.map((row, index) => (
        <div key={index} className="spread" style={{ gap: 12 }}>
          <span className="dim tiny">{row.label}</span>
          <span className="mono tiny" style={{ color: 'var(--text-0)', textAlign: 'right' }}>
            {row.value}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Compact inline success line used after a tool produces output. */
export function ResultSummary({ title, children }: { title?: ReactNode; children: ReactNode }) {
  return (
    <div className="row-top tiny" style={{ color: 'var(--text-1)' }}>
      <CircleCheck style={{ width: 16, height: 16, color: 'var(--success)', flexShrink: 0 }} />
      <div>
        {title && (
          <div className="strong" style={{ color: 'var(--text-0)' }}>
            {title}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

/** Uniform number + unit readout for statistics panels. */
export function CountBadge({ value, label }: { value: number; label: string }) {
  return (
    <span className="row tiny dim" style={{ gap: 5 }}>
      <span className="mono strong" style={{ color: 'var(--text-0)' }}>
        {formatNumber(value)}
      </span>
      {label}
    </span>
  );
}

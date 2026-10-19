import { lazy, Suspense, useEffect, useMemo } from 'react';
import { getTool, relatedTools } from '../core/registry';
import { useAppState } from '../core/store';
import { ErrorBoundary, ToolLoading } from '../components/ErrorBoundary';
import { ToolChromeProvider } from './ToolChrome';
import { EmptyState } from '../components/ui';
import { Compass, Lightbulb } from 'lucide-react';
import { ToolGrid } from '../components/ToolCard';

/**
 * Resolves a tool from the registry, loads its module on demand and provides
 * the workspace chrome. Heavy libraries therefore only load for the tool the
 * user actually opens.
 */
export function ToolView({
  toolId,
  onBack,
  onOpenTool,
}: {
  toolId: string;
  onBack: () => void;
  onOpenTool: (toolId: string) => void;
}) {
  const tool = getTool(toolId);
  const { recordRun, isFavorite, toggleFavorite } = useAppState();

  useEffect(() => {
    if (tool) recordRun(tool.id);
    // Record once per opened tool.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool?.id]);

  const LazyTool = useMemo(() => (tool ? lazy(tool.load) : null), [tool]);
  const related = useMemo(() => (tool ? relatedTools(tool.id, 4) : []), [tool]);

  if (!tool || !LazyTool) {
    return (
      <div className="content-inner">
        <EmptyState
          icon={<Compass />}
          title="Tool not found"
          text="This tool is not registered. It may have been renamed — use the sidebar or search to find what you need."
        />
      </div>
    );
  }

  const favorite = isFavorite(tool.id);

  return (
    <div className="content-inner">
      <ToolChromeProvider
        value={{
          tool,
          onBack,
          isFavorite: favorite,
          onToggleFavorite: () => toggleFavorite(tool.id),
        }}
      >
        <ErrorBoundary scope={tool.name} key={tool.id}>
          <Suspense fallback={<ToolLoading name={tool.name} />}>
            <LazyTool />
          </Suspense>
        </ErrorBoundary>
      </ToolChromeProvider>

      {related.length > 0 && (
        <section className="dash-section" style={{ marginTop: 34 }}>
          <div className="dash-head">
            <h2>
              <Lightbulb />
              You may also need
            </h2>
          </div>
          <ToolGrid
            tools={related}
            onOpen={onOpenTool}
            isFavorite={isFavorite}
            onToggleFavorite={toggleFavorite}
            showCategory={false}
          />
        </section>
      )}
    </div>
  );
}

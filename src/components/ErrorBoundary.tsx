import { Component, type ErrorInfo, type ReactNode } from 'react';
import { RefreshCw, TriangleAlert } from 'lucide-react';
import { Button, Notice } from './ui';

interface Props {
  children: ReactNode;
  /** Label shown in the error panel, e.g. the tool name. */
  scope?: string;
  onReset?: () => void;
}

interface State {
  error: Error | null;
  showDetail: boolean;
}

/**
 * Keeps one broken tool from taking down the whole application, and hides
 * technical detail behind an explicit disclosure.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, showDetail: false };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[GameDev Toolkit]', this.props.scope ?? 'app', error, info.componentStack);
  }

  private reset = () => {
    this.setState({ error: null, showDetail: false });
    this.props.onReset?.();
  };

  render(): ReactNode {
    const { error, showDetail } = this.state;
    if (!error) return this.props.children;

    return (
      <Notice
        tone="error"
        title={`${this.props.scope ?? 'This tool'} ran into a problem`}
        actions={
          <div className="row" style={{ alignSelf: 'center' }}>
            <Button size="sm" variant="outline" icon={<RefreshCw />} onClick={this.reset}>
              Try again
            </Button>
            <Button size="sm" variant="ghost" onClick={() => this.setState({ showDetail: !showDetail })}>
              {showDetail ? 'Hide details' : 'Details'}
            </Button>
          </div>
        }
      >
        <p>
          {error.message || 'An unexpected error occurred.'} Your files were not uploaded anywhere —
          everything runs locally, so you can simply try again.
        </p>
        {showDetail && (
          <pre className="code" style={{ marginTop: 10, maxHeight: 220 }}>
            {error.stack ?? String(error)}
          </pre>
        )}
      </Notice>
    );
  }
}

/** Loading placeholder shown while a lazy tool module is fetched. */
export function ToolLoading({ name }: { name?: string }) {
  return (
    <div className="empty" style={{ minHeight: 320 }}>
      <TriangleAlert style={{ display: 'none' }} />
      <span className="spinner spinner-lg" />
      <div className="empty-title">Loading {name ?? 'tool'}…</div>
      <div className="empty-text">
        Specialised libraries for this tool are fetched on demand so the rest of the toolkit stays fast.
      </div>
    </div>
  );
}

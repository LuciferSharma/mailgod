import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('UI error:', error, info);
  }

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="m-6 p-6 rounded-lg border border-red-500/30 bg-red-500/5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-semibold text-red-500 mb-1">Something went wrong rendering this page.</h3>
              <p className="text-xs text-subtle mb-2">
                The error is logged to the browser console. Try refreshing, or navigate back and try again.
              </p>
              <pre className="text-[11px] text-dim bg-elevated rounded p-2 overflow-x-auto whitespace-pre-wrap break-words">
                {this.state.error.message}
              </pre>
              <button
                onClick={() => this.setState({ error: null })}
                className="mt-3 px-3 py-1 text-xs border border-line rounded-md hover:bg-elevated"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = {
  onClose: () => void;
  children: ReactNode;
};

type State = {
  error: Error | null;
};

/**
 * Keeps the Desktop chrome alive if a settings catalog/store blows up.
 * Without this, a settings render error unmounts the whole #root → white screen.
 */
export class SettingsErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[settings]', error, info.componentStack);
  }

  private handleClose = () => {
    this.setState({ error: null });
    this.props.onClose();
  };

  render() {
    if (this.state.error) {
      return (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-chrome-scrim p-6">
          <div className="w-full max-w-md rounded-chrome-panel border border-chrome-border bg-chrome-surface p-4 shadow-lg">
            <p className="text-sm font-semibold text-gray-900">Settings failed to open</p>
            <p className="mt-2 max-h-40 overflow-y-auto font-mono text-xs text-red-600">
              {this.state.error.message}
            </p>
            <button
              type="button"
              className="mt-4 rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white"
              onClick={this.handleClose}
            >
              Close
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

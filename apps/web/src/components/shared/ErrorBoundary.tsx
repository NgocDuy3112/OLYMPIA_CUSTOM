import React from "react";

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/** Bắt lỗi render (kể cả lazy chunk fail) — hiện lỗi thay vì trắng trang. */
export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error("Render crash:", error, info.componentStack);
  }

  private handleReset = (): void => {
    this.setState({ error: null });
    window.location.reload();
  };

  render(): React.ReactNode {
    if (this.state.error) {
      return (
        <div className="flex justify-center items-start min-h-screen p-6 text-white">
          <div className="w-full max-w-2xl rounded-xl bg-red-950/60 border border-red-500/40 p-5 flex flex-col gap-3">
            <p className="font-bold text-red-300">
              Trang gặp lỗi — gửi đoạn này cho dev
            </p>
            <p className="text-sm font-mono break-all text-red-200">
              {String(this.state.error.message)}
            </p>
            <pre className="text-[11px] font-mono text-gray-400 whitespace-pre-wrap break-all max-h-48 overflow-y-auto">
              {this.state.error.stack}
            </pre>
            <div>
              <button
                onClick={this.handleReset}
                className="px-4 py-2 rounded-lg bg-red-700 hover:bg-red-600 text-sm font-semibold"
              >
                Tải lại trang
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;

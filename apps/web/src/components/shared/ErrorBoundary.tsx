import React from "react";
import { Button } from "@/components/ui/button";

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

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
        <div className="flex justify-center items-start min-h-screen p-6 text-foreground">
          <div className="w-full max-w-2xl rounded-xl bg-destructive/10 border border-destructive/40 p-5 flex flex-col gap-3">
            <p className="font-bold text-destructive">
              Trang gặp lỗi — gửi đoạn này cho dev
            </p>
            <p className="text-sm font-mono break-all text-destructive/80">
              {String(this.state.error.message)}
            </p>
            <pre className="text-[11px] font-mono text-muted-foreground whitespace-pre-wrap break-all max-h-48 overflow-y-auto">
              {this.state.error.stack}
            </pre>
            <div>
              <Button variant="destructive" onClick={this.handleReset}>
                Tải lại trang
              </Button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;

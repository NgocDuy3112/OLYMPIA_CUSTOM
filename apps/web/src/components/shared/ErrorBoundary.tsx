import React from "react";
import { createLogger } from "@/utils/logger";

const logger = createLogger("ErrorBoundary");

interface State {
  hasError: boolean;
  error?: unknown;
}

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    logger.error("ErrorBoundary caught an error:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6">
          <h2 className="text-xl font-bold text-white">Đã xảy ra lỗi</h2>
          <p className="text-sm text-white/80">
            Vui lòng thử tải lại trang hoặc liên hệ kỹ thuật. (ErrorBoundary)
          </p>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

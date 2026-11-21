import { Component, type ErrorInfo, type ReactNode } from "react"

import { logError } from "./log"

interface ErrorBoundaryProps {
    /** Scope name used in logs, e.g. "gameplay" or "portal:stage". */
    scope: string
    /** Optional surface shown instead of the default full-screen card. */
    fallback?: (reset: () => void, error: Error) => ReactNode
    children: ReactNode
}

interface ErrorBoundaryState {
    error: Error | null
}

/**
 * Last line of defence for a render crash. A wrong payload should never leave a
 * live show with a blank screen: it catches, logs, and offers a reload.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    state: ErrorBoundaryState = { error: null }

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { error }
    }

    componentDidCatch(error: Error, info: ErrorInfo): void {
        const scope = this.props.scope
        logError(scope, { error, componentStack: info.componentStack ?? "" })
    }

    reset = () => {
        this.setState({ error: null })
    }

    render(): ReactNode {
        const { error } = this.state
        if (error === null) return this.props.children
        if (this.props.fallback) return this.props.fallback(this.reset, error)
        return <BoundaryCard error={error} onReset={this.reset} />
    }
}

function BoundaryCard({ error, onReset }: { error: Error; onReset: () => void }) {
    const reload = () => {
        if (typeof window !== "undefined") window.location.reload()
    }
    return (
        <div
            role="alert"
            className="flex min-h-dvh w-full flex-col items-center justify-center gap-3 px-6 py-16 text-center"
        >
            <h1 className="font-display text-2xl font-bold uppercase leading-none">
                Màn hình gặp lỗi
            </h1>
            <p className="max-w-md font-sans text-sm text-muted-foreground">
                Trạng thái vừa nhận không hiển thị được. Tải lại để đồng bộ với trận —
                kết quả phía máy chủ không bị ảnh hưởng.
            </p>
            <p className="max-w-md font-mono text-xs break-words text-destructive">{error.message}</p>
            <div className="flex gap-2">
                <button
                    type="button"
                    onClick={reload}
                    className="rounded-lg bg-primary px-4 py-2 font-sans text-sm font-semibold text-primary-foreground"
                >
                    Tải lại
                </button>
                <button
                    type="button"
                    onClick={onReset}
                    className="rounded-lg border border-border px-4 py-2 font-sans text-sm font-semibold text-muted-foreground"
                >
                    Thử lại
                </button>
            </div>
        </div>
    )
}

import { useEffect } from "react"


/**
 * Warn before leaving a live screen. A contestant who reloads or follows a
 * stray link mid-question loses their clock; the browser asks first.
 *
 * Only `beforeunload` is used: it is the one prompt every browser honours, and
 * it never blocks a deliberate in-app navigation (no dead-end dialogs).
 */
export function useExitGuard(active: boolean, message: string): void {
    useEffect(() => {
        if (!active || typeof window === "undefined") return
        const warn = (event: BeforeUnloadEvent) => {
            event.preventDefault()
            // Safari/Chrome < 119 still read the legacy returnValue.
            event.returnValue = message
            return message
        }
        window.addEventListener("beforeunload", warn)
        return () => window.removeEventListener("beforeunload", warn)
    }, [active, message])
}

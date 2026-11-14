/**
 * The browser has no log file — the operator's devtools IS the log. One helper
 * so a failure the app swallows (and already shows in the UI) still leaves a
 * line somebody can copy into a report: `[aoc:api] GET /portal/players → 500`.
 *
 * Deliberately silent in test runs: those tests assert the failure itself, and
 * printing it a second time only buries the output people read.
 */
export function logError(scope: string, error: unknown): void {
    if (import.meta.env?.MODE === "test") return
    console.error(`[aoc:${scope}]`, error)
}

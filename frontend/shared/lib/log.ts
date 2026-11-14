export function logError(scope: string, error: unknown): void {
    if (import.meta.env?.MODE === "test") return
    console.error(`[aoc:${scope}]`, error)
}

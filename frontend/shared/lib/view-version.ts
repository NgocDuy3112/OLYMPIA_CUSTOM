/**
 * A view frame may race a slower REST refetch: never paint a frame older than the
 * cached view, or the deck jumps back a stage and drops a buzz window. The version
 * is optional on both sides, so only two comparable versions can prove staleness.
 */
export function isOlderView(
    frame: { version?: number } | null | undefined,
    cached: { version?: number } | null | undefined
): boolean {
    if (!frame || !cached) return false
    if (typeof frame.version !== "number" || typeof cached.version !== "number") return false
    return frame.version < cached.version
}

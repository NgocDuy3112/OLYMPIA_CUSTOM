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

/**
 * The other half of the same race: a REST read can land after the stream already
 * moved the view on. Feed this to `structuralSharing` so an older read keeps the
 * cached view instead of repainting it. A read without a version proves nothing
 * and is always kept.
 */
export function keepNewestRead<T extends { version?: number }>(old: T | undefined, next: T): T {
    if (old !== undefined && isOlderView(next, old)) return old
    return next
}

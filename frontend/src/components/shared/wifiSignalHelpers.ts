/**
 * Latency band → number of lit bars (out of 4).
 * Tuned for Vietnamese home networks behind WiFi where 100ms is acceptable but
 * anything approaching a full second indicates visible gameplay lag.
 *
 *   < 100ms  → 4 bars (excellent)
 *   < 300ms  → 3 bars (good)
 *   < 800ms  → 2 bars (poor)
 *   ≥ 800ms  → 1 bar  (bad)
 *   null     → 0 bars (sampling / no data)
 */
export function latencyToBars(ms: number | null | undefined): 0 | 1 | 2 | 3 | 4 {
    if (ms == null) return 0;
    if (ms < 100) return 4;
    if (ms < 300) return 3;
    if (ms < 800) return 2;
    return 1;
}

/**
 * Latency band → Tailwind text color class.
 * Keeps the existing blue/gray palette of the admin UI in mind:
 *   4 bars → green-400 (great)
 *   3 bars → lime-400   (good)
 *   2 bars → amber-400  (poor)
 *   1 bar  → red-400    (bad)
 *   0 bars → gray-500   (no data / pending)
 */
export function latencyToColorClass(ms: number | null | undefined): string {
    const bars = latencyToBars(ms);
    switch (bars) {
        case 4: return "text-green-400";
        case 3: return "text-lime-400";
        case 2: return "text-amber-400";
        case 1: return "text-red-400";
        default: return "text-gray-500";
    }
}

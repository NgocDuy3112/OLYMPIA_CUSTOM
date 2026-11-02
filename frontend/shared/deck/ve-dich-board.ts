import type { PlayerView } from "./types"

// The Về đích show table — ONE fixed matrix shared by both surfaces and both
// phases: 6 domains across, 4 score bands down (20 → 50, as drawn).
//
// Board order matters: the console and the player must line up cell-for-cell
// or the MC points at a different square than the contestant sees. Custom
// tournaments may carry other domains — those sort last, alphabetically.

export const VE_DOMAINS = ["THTH", "TNSS", "XHPL", "VHNT", "TTGT", "KTTH"] as const;
export const VE_VALUES = [20, 30, 40, 50] as const;

const domainRank = (domain: string): number => {
    const index = (VE_DOMAINS as readonly string[]).indexOf(domain);
    return index === -1 ? VE_DOMAINS.length : index;
};

/** Row-major: score band first (20 at the top), then the canonical domain
 *  order — pure, table-tested. */
export function sortVeCells<T>(
    items: readonly T[],
    domainOf: (item: T) => string,
    valueOf: (item: T) => number
): T[] {
    return [...items].sort((a, b) => {
        const byValue = valueOf(a) - valueOf(b);
        if (byValue !== 0) return byValue;
        const byRank = domainRank(domainOf(a)) - domainRank(domainOf(b));
        if (byRank !== 0) return byRank;
        return domainOf(a).localeCompare(domainOf(b));
    });
}

/** The chips above the open question: this turn's OPEN + PENDING cells only —
 *  the same slice the MC's card header shows, so both surfaces point at the
 *  same squares. */
export function stripCellsOf(board: PlayerView["board"]): NonNullable<PlayerView["board"]> {
    return (board ?? []).filter((cell) => cell.where === "open" || cell.where === "pending");
}

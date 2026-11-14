import type { ContestantRow } from "@/lib/tournament"

/** "5 contestants" — the read-only tab's header line. */
export function rosterSummary(rows: ContestantRow[]): string {
    return `${rows.length} contestant${rows.length === 1 ? "" : "s"}`
}

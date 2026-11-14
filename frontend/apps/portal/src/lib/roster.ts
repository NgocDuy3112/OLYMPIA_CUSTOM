import type { ContestantRow } from "@/lib/tournament"

export function rosterSummary(rows: ContestantRow[]): string {
    return `${rows.length} contestant${rows.length === 1 ? "" : "s"}`
}

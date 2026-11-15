import type { ContestantRow } from "@/lib/tournament"

export function rosterSummary(rows: ContestantRow[]): string {
    let plural = "s"
    if (rows.length === 1) plural = ""
    return `${rows.length} contestant${plural}`
}

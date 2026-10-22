import type { Match, StandingRow, TournamentIdentity } from "@/data/schedule"
import type { Stage } from "@/data/stages"
import { OLYMPIA_STAGES } from "@/data/stages"
import { sampleTournament } from "@/data/sample/tournaments"
import { sampleMatches } from "@/data/sample/matches"
import { sampleStandings } from "@/data/sample/standings"

export interface Tournament extends TournamentIdentity {
    id: string
    name: string
    current: boolean
    stages: Stage[]
    matches: Match[]
    standings: StandingRow[]
}

// ── Tournament 3 (the real sample data) ─────────────────────────
const tournament3: Tournament = {
    id: "2025-a",
    name: "Olympia Custom 3",
    current: true,
    subtitle: sampleTournament.subtitle,
    venue: sampleTournament.venue,
    startDate: sampleTournament.startDate,
    endDate: sampleTournament.endDate,
    stages: OLYMPIA_STAGES,
    matches: sampleMatches,
    standings: sampleStandings,
}

// ── Tournament 2 (mock: same shape, shifted dates/names) ────────
const tournament2: Tournament = {
    id: "2024-b",
    name: "Olympia Custom 2",
    current: false,
    subtitle: "Tournament 2 - Finals Weekend",
    venue: sampleTournament.venue,
    startDate: "2024-06-14",
    endDate: "2024-06-15",
    stages: OLYMPIA_STAGES.map((s) => ({
        ...s,
        start: s.start.replace("2025", "2024"),
        end: s.end.replace("2025", "2024"),
    })),
    matches: sampleMatches.map((m) => ({
        ...m,
        date: m.date.replace("2025", "2024"),
    })),
    standings: sampleStandings,
}

// ── Tournament 1 (mock) ─────────────────────────────────────────
const tournament1: Tournament = {
    id: "2023-a",
    name: "Olympia Custom 1",
    current: false,
    subtitle: "Tournament 1 - Finals Weekend",
    venue: sampleTournament.venue,
    startDate: "2023-06-14",
    endDate: "2023-06-15",
    stages: OLYMPIA_STAGES.map((s) => ({
        ...s,
        start: s.start.replace("2025", "2023"),
        end: s.end.replace("2025", "2023"),
    })),
    matches: sampleMatches.map((m) => ({
        ...m,
        date: m.date.replace("2025", "2023"),
    })),
    standings: sampleStandings,
}

export const SEASONS: Tournament[] = [tournament3, tournament2, tournament1]

export const CURRENT_SEASON: Tournament =
    SEASONS.find((s) => s.current) ?? SEASONS[0]

export function findTournament(id: string | undefined): Tournament | undefined {
    return SEASONS.find((s) => s.id === id)
}
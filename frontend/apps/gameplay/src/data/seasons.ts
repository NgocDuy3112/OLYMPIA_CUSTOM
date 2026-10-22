import type { Match, StandingRow } from "@/data/schedule"
import type { Stage } from "@/data/stages"
import { OLYMPIA_STAGES } from "@/data/stages"
import { sampleTournament } from "@/data/sample/tournament"
import { sampleMatches } from "@/data/sample/matches"
import { sampleStandings } from "@/data/sample/standings"

export interface Season {
    id: string
    name: string
    subtitle: string
    venue: string
    startDate: string
    endDate: string
    current: boolean
    stages: Stage[]
    matches: Match[]
    standings: StandingRow[]
}

// ── Season 3 (the real sample data) ─────────────────────────
const season3: Season = {
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

// ── Season 2 (mock: same shape, shifted dates/names) ────────
const season2: Season = {
    id: "2024-b",
    name: "Olympia Custom 2",
    current: false,
    subtitle: "Season 2 - Finals Weekend",
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

// ── Season 1 (mock) ─────────────────────────────────────────
const season1: Season = {
    id: "2023-a",
    name: "Olympia Custom 1",
    current: false,
    subtitle: "Season 1 - Finals Weekend",
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

export const SEASONS: Season[] = [season3, season2, season1]

export const CURRENT_SEASON: Season =
    SEASONS.find((s) => s.current) ?? SEASONS[0]

export function findSeason(id: string | undefined): Season | undefined {
    return SEASONS.find((s) => s.id === id)
}
import type { MatchQuestion } from "./questions"

export type MatchStatus = "UPCOMING" | "LIVE" | "FINISHED"

export type MatchKind = "STANDARD"

export interface MatchSeat {
    kind: "user"
    userId: string
    seed: number
}

export interface MatchSummary {
    id: string
    stageId: string
    slot: number | null
    label: string
    status: MatchStatus
    scheduledAt: string
    players: MatchSeat[]
    questions: MatchQuestion[]
    assemblyRevision: number
    assembledAt: string | null
}

export interface MatchAssemblyEvent {
    id: string
    matchId: string
    revision: number
    actorId: string
    mode: string
    addedCount: number
    removedCount: number
    sourceIds: string[]
    at: string
}

export interface MatchDetail {
    id: string
    tournamentId: string
    stageId: string
    scheduledAt: string
    label: string
    status: MatchStatus
    kind: MatchKind
    slot: number | null
    players: MatchSeat[]
    roundConfigs: Record<string, unknown>
    questions: MatchQuestion[]
    assemblyRevision: number
    assembledAt: string | null
    controllerId: string | null
    controllerHeartbeatAt: string | null
    live: unknown
    discord: unknown
    createdAt: string
    updatedAt: string
    deletedAt: string | null
    assemblyEvents: MatchAssemblyEvent[]
}

export interface StandingRow {
    userId: string
    displayName: string
    place: number | null
    matchesPlayed: number
    stageId: string | null
    stageTitle: string | null
    slot: number | null
}

export interface ContestantRow {
    userId: string
    displayName: string
    username: string
    email: string | null
    discordId: string | null
    group: "A" | "B" | null
    enrolledAt: string
}

export interface RoomCode {
    matchId: string
    code: string
    expiresAt: string
}

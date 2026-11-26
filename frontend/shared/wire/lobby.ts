export type TournamentStatus = "UPCOMING" | "LIVE" | "FINISHED"

export interface LobbyRound {
    id: string
    name: string
    status: "new" | "playing" | "ended"
}

export interface LobbySeat {
    id: string
    displayName: string
    points: number
    rank: number
}

export interface Lobby {
    title: string
    label: string
    status: TournamentStatus
    roundId: string | null
    rounds: LobbyRound[]
    table: LobbySeat[]
    connected: string[]
}

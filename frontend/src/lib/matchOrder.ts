import type { Match, PlayerResult } from "@/data/schedule";


export function orderMatchPlayers(match: Match): PlayerResult[] {
    const players = [...match.players]
    if (match.status === "FINISHED") return players.sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));
    if (match.status === "LIVE") return players.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    return players.sort((a, b) => (a.seed ?? 999) - (b.seed ?? 999));
}
import type { matches, tournaments } from "../../db/schema/index.js";
import type { ResultEntry, Stage } from "../../game/contracts/index.js";
import type { PlayerStanding } from "../../game/engine/scoring/standings.js";
import type {
    PublicMatch,
    PublicPlayer,
    PublicResultEntry,
    PublicTournament,
    PublicTournamentSummary
} from "./schemas.js";

type TournamentRow = typeof tournaments.$inferSelect;
type MatchRow = typeof matches.$inferSelect;

function seatId(seat: MatchRow["players"][number]): string {
    return seat.userId;
}

export function stageRange(stages: Stage[]): { start: string | null; end: string | null } {
    let start: string | null = null;
    let end: string | null = null;
    for (const stage of stages) {
        if (stage.start && (start === null || stage.start < start)) start = stage.start;
        if (stage.end && (end === null || stage.end > end)) end = stage.end;
    }
    return { start, end };
}

export function presentTournament(row: TournamentRow, places: number): PublicTournament {
    const range = stageRange(row.stages);
    return {
        id: row.id,
        slug: row.slug,
        name: row.name,
        current: row.current,
        createdAt: row.createdAt.toISOString(),
        closedAt: row.closedAt ? row.closedAt.toISOString() : null,
        start: range.start,
        end: range.end,
        rounds: row.rounds,
        format: row.format,
        stages: row.stages,
        places
    };
}

export function presentTournamentSummary(row: TournamentRow): PublicTournamentSummary {
    const range = stageRange(row.stages);
    return {
        id: row.id,
        slug: row.slug,
        name: row.name,
        current: row.current,
        createdAt: row.createdAt.toISOString(),
        start: range.start,
        end: range.end
    };
}

export function matchRound(row: Pick<MatchRow, "stageId" | "label">, stageTitles: Map<string, string>): string {
    return `${stageTitles.get(row.stageId) ?? row.stageId} · ${row.label}`;
}

export function presentMatch(
    row: MatchRow,
    stageTitles: Map<string, string>,
    names: Record<string, string>,
    results?: ResultEntry[]
): PublicMatch {
    const players: PublicPlayer[] = row.players.map((seat) => {
        const id = seatId(seat);
        return { id, name: names[id] ?? "Unknown", seed: seat.seed };
    });

    const base = {
        id: row.id,
        stageId: row.stageId,
        slot: row.slot,
        status: row.status,
        scheduledAt: row.scheduledAt.toISOString(),
        round: matchRound(row, stageTitles),
        players
    };

    if (!results) return base;

    const publicResults: PublicResultEntry[] = results.map((entry) => {
        const id = entry.userId;
        return {
            id,
            name: names[id] ?? "Unknown",
            totalScore: entry.totalScore,
            rank: entry.rank,
            roundScores: entry.roundScores
        };
    });

    return { ...base, results: publicResults };
}

export function presentStanding(row: PlayerStanding) {
    return {
        userId: row.userId,
        displayName: row.displayName,
        place: row.place,
        matchesPlayed: row.matchesPlayed,
        stageId: row.stageId,
        stageTitle: row.stageTitle,
        slot: row.slot
    };
}

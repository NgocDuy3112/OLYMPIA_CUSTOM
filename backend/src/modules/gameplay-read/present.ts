// The public shape of a tournament, a match and a standing row.
//
// An ALLOWLIST, not a strip-list: these functions pick the fields they return, so a
// column added to the schema later stays private until someone picks it here. The
// match rows carry `questions` (the frozen copies — WITH the answers), `roundConfigs`,
// `live` and `discord`; none of them may ever be picked.
//
// Pure — no database, no fastify. Covered by tests/unit/gameplay-read/present.test.ts.
import type { matches, tournaments } from "../../db/schema/index.js";
import type { ResultEntry, Stage } from "../../game/contracts/index.js";
import type { PlayerStanding } from "../../game/engine/scoring/standings.js";
import type { ScaleCoverage } from "../../game/engine/scoring/placement.js";
import type {
    PublicMatch,
    PublicPlayer,
    PublicResultEntry,
    PublicTournament,
    PublicTournamentSummary
} from "./schemas.js";

type TournamentRow = typeof tournaments.$inferSelect;
type MatchRow = typeof matches.$inferSelect;

// A seat names either a user or a team — narrowed on its kind, never probed.
function seatId(seat: MatchRow["players"][number]): string {
    return seat.kind === "user" ? seat.userId : seat.teamId;
}

// The tournament's window, derived from its stage list. A stage without dates does
// not move the window; a tournament whose stages are all undated has none.
export function stageRange(stages: Stage[]): { start: string | null; end: string | null } {
    let start: string | null = null;
    let end: string | null = null;
    for (const stage of stages) {
        if (stage.start && (start === null || stage.start < start)) start = stage.start;
        if (stage.end && (end === null || stage.end > end)) end = stage.end;
    }
    return { start, end };
}

export function presentTournament(
    row: TournamentRow,
    places: number,
    points: ScaleCoverage
): PublicTournament {
    // ownerId, tags, roundRules, updatedAt and deletedAt are picked by NOBODY.
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
        placementTiers: row.placementTiers,
        places,
        points
    };
}

// The list route's slim shape — the same allowlist, minus the rules and the places.
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

// The display string the schedule shows: the stage's title with the match's own
// label behind it. An unknown stageId falls back to the raw id — the schedule
// degrades, it never throws.
export function matchRound(row: Pick<MatchRow, "stageId" | "label">, stageTitles: Map<string, string>): string {
    return `${stageTitles.get(row.stageId) ?? row.stageId} · ${row.label}`;
}

// stageTitles comes from the tournament the service already loaded — stages are
// jsonb on the row, so resolving them costs no extra query.
export function presentMatch(
    row: MatchRow,
    stageTitles: Map<string, string>,
    names: Record<string, string>,
    results?: ResultEntry[]
): PublicMatch {
    // questions, roundConfigs, live, discord, tournamentId, createdAt, updatedAt,
    // deletedAt — picked by nobody.
    const players: PublicPlayer[] = row.players.map((seat) => {
        const id = seatId(seat);
        return { id, name: names[id] ?? "Unknown", seed: seat.seed };
    });

    const base = {
        id: row.id,
        stageId: row.stageId,
        slot: row.slot,
        status: row.status,
        kind: row.kind,
        scheduledAt: row.scheduledAt.toISOString(),
        round: matchRound(row, stageTitles),
        players
    };

    // Only a caller that has the stored match_results passes results in — the
    // schedule embeds them for FINISHED matches and nothing else carries them.
    if (!results) return base;

    const publicResults: PublicResultEntry[] = results.map((entry) => {
        const id = entry.userId ?? entry.teamId!;        return {
            id,
            name: names[id] ?? "Unknown",
            totalScore: entry.totalScore,
            rank: entry.rank,
            roundScores: entry.roundScores
        };
    });

    return { ...base, results: publicResults };
}

// A standing row is already display data; this only pins the shape.
export function presentStanding(row: PlayerStanding) {
    return {
        userId: row.userId,
        displayName: row.displayName,
        place: row.place,
        matchesPlayed: row.matchesPlayed,
        placementPoints: row.placementPoints,
        stageId: row.stageId,
        stageTitle: row.stageTitle,
        slot: row.slot,
        tieBreak: row.tieBreak
    };
}

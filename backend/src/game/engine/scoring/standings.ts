// The tournament's standings: a placement table, not a points league.
//
// The place of a player is decided by HOW FAR THEY GOT, never by a sum of scores:
//   - the tournament's stages are ordered (the tournament's stage list is that order);
//   - inside a stage, the matches are ordered by their slot;
//   - inside a match, the player's own rank in that match decides.
//
// So the tournament's places are the concatenation of the stages, last first, and inside a
// stage the slots, and inside a slot the match's own result. A player who never took a
// seat has no place: they are listed at the bottom, with no points.
//
// The points are a statistic, not the ranking key: a tie for a placement shares the
// place (dense numbering), never a silent break.
import type { PlacementTier } from "../../contracts/index.js";
import { pointsForPlace } from "./placement.js";

export interface StageRef {
    id: string;
    title: string;
}

export interface MatchResultInput {
    matchId: string;
    stageId: string;
    slot: number | null;
    results: Array<{ userId: string; totalScore: number; rank: number }>;
}

export interface PlayerStanding {
    userId: string;
    displayName: string;
    place: number | null;         // null for a player who never played
    matchesPlayed: number;
    placementPoints: number;       // what the place is worth, from the tournament's tiers
    stageId: string | null;        // the stage they got to
    stageTitle: string | null;
    slot: number | null;           // the match they were eliminated in
}

export interface BuildStandingsInput {
    stages: StageRef[];            // the tournament's stages, in order
    matches: MatchResultInput[];   // the points matches that were played
    players: Array<{ userId: string; displayName: string }>;   // the roster
    tiers: PlacementTier[];
}

// The furthest a player got: the latest stage, then the lowest slot, then the best rank.
interface Progress {
    stageIndex: number;
    slot: number;
    rank: number;
    stageId: string;
    stageTitle: string;
    matchId: string;
}

function isFurther(a: Progress, b: Progress | undefined): boolean {
    if (!b) return true;
    if (a.stageIndex !== b.stageIndex) return a.stageIndex > b.stageIndex;
    if (a.slot !== b.slot) return a.slot < b.slot;
    return a.rank < b.rank;
}

export function buildStandings(input: BuildStandingsInput): PlayerStanding[] {
    const stageIndex = new Map(input.stages.map((stage, index) => [stage.id, index]));
    const stageTitle = new Map(input.stages.map((stage) => [stage.id, stage.title]));

    // The furthest each player got, and how many matches they played.
    const progress = new Map<string, Progress>();
    const played = new Map<string, number>();

    for (const match of input.matches) {
        const index = stageIndex.get(match.stageId);
        if (index === undefined) continue;      // a match in a stage the tournament does not list

        for (const entry of match.results) {
            played.set(entry.userId, (played.get(entry.userId) ?? 0) + 1);

            const candidate: Progress = {
                stageIndex: index,
                slot: match.slot ?? Number.MAX_SAFE_INTEGER,
                rank: entry.rank,
                stageId: match.stageId,
                stageTitle: stageTitle.get(match.stageId) ?? match.stageId,
                matchId: match.matchId
            };

            if (isFurther(candidate, progress.get(entry.userId))) {
                progress.set(entry.userId, candidate);
            }
        }
    }

    // The order of the tournament's places: the last stage first, then the slots, then the
    // match's own rank.
    const placed = [...progress.entries()]
        .map(([userId, value]) => ({ userId, value }))
        .sort((a, b) =>
            b.value.stageIndex - a.value.stageIndex
            || a.value.slot - b.value.slot
            || a.value.rank - b.value.rank
            || a.userId.localeCompare(b.userId));

    // The place numbers: a tie inside a match shares a place, and the next player takes
    // the next number (dense, the same convention the match's own result uses).
    const rows: PlayerStanding[] = [];
    let place = 0;
    let previous: { userId: string; value: Progress } | null = null;

    for (const entry of placed) {
        const value = entry.value;
        const sameMatch = previous !== null
            && previous.value.matchId === value.matchId
            && previous.value.rank === value.rank;
        if (!sameMatch) place += 1;

        rows.push({
            userId: entry.userId,
            displayName: input.players.find((row) => row.userId === entry.userId)?.displayName ?? entry.userId,
            place,
            matchesPlayed: played.get(entry.userId) ?? 0,
            placementPoints: pointsForPlace(input.tiers, place),
            stageId: value.stageId,
            stageTitle: value.stageTitle,
            slot: value.slot === Number.MAX_SAFE_INTEGER ? null : value.slot
        });

        previous = entry;
    }

    // The players who never took a seat: listed at the bottom, with no place.
    const seated = new Set(progress.keys());
    const idle = input.players
        .filter((row) => !seated.has(row.userId))
        .map((row) => ({
            userId: row.userId,
            displayName: row.displayName,
            place: null,
            matchesPlayed: 0,
            placementPoints: 0,
            stageId: null,
            stageTitle: null,
            slot: null
        }));

    return [...rows, ...idle];
}


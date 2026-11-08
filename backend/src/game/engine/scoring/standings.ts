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
    place: number | null;         
    matchesPlayed: number;
    stageId: string | null;        
    stageTitle: string | null;
    slot: number | null;           
}

export interface BuildStandingsInput {
    stages: StageRef[];            
    matches: MatchResultInput[];   
    players: Array<{ userId: string; displayName: string }>;   
}

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

    const progress = new Map<string, Progress>();
    const played = new Map<string, number>();

    for (const match of input.matches) {
        const index = stageIndex.get(match.stageId);
        if (index === undefined) continue;      

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

    const placed = [...progress.entries()]
        .map(([userId, value]) => ({ userId, value }))
        .sort((a, b) =>
            b.value.stageIndex - a.value.stageIndex
            || a.value.slot - b.value.slot
            || a.value.rank - b.value.rank
            || a.userId.localeCompare(b.userId));

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
            stageId: value.stageId,
            stageTitle: value.stageTitle,
            slot: value.slot === Number.MAX_SAFE_INTEGER ? null : value.slot
        });

        previous = entry;
    }

    const seated = new Set(progress.keys());
    const idle = input.players
        .filter((row) => !seated.has(row.userId))
        .map((row) => ({
            userId: row.userId,
            displayName: row.displayName,
            place: null,
            matchesPlayed: 0,
            stageId: null,
            stageTitle: null,
            slot: null
        }));

    return [...rows, ...idle];
}


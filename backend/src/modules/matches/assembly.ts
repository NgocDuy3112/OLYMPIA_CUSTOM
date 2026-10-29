import { randomUUID } from "node:crypto";
import { inArray } from "drizzle-orm";
import { db } from "../../db/pool.js";
import { questionBank, tournaments } from "../../db/schema/index.js";
import type { MatchQuestion, RoundConfig, ScoringRule } from "../../game/contracts/index.js";
import { MatchError } from "./errors.js";
import { assemblyEligibility } from "../questions/service.js";
import type { AssemblyEntry } from "./schemas.js";

type TournamentRow = typeof tournaments.$inferSelect;
type BankRow = typeof questionBank.$inferSelect;
type QuestionKind = "MC" | "TEXT" | "KEYWORD" | "HINT";


// §5: points are a per-question base. Templates that ignore them (the ve-dich
// grid) still need a number, so derive from the scoring rule; callers may override.
export function basePoints(scoring: ScoringRule): number {
    switch (scoring.template) {
        case "constant":
            return scoring.points;
        case "keyword_derived":
            return scoring.initial;
        case "rank_multiplier":
            return scoring.ladderTop;
        case "outcome_multipliers":
            return 1;
    }
}


function requireTurn(params: {
    tournament: TournamentRow;
    roundConfigs: Record<string, RoundConfig>;
    roundId: string;
    turnId: string;
    where: string;
}): { config: RoundConfig; mode: "oral" | "text" } {
    const { tournament, roundConfigs, roundId, turnId, where } = params;

    if (!tournament.rounds.some((round) => round.id === roundId)) {
        throw new MatchError(
            "VALIDATION",
            `${where}: round "${roundId}" is not one of this tournament's rounds`
        );
    }

    const config = roundConfigs[roundId];
    if (!config) {
        throw new MatchError(
            "VALIDATION",
            `${where}: no roundConfig provided for round "${roundId}"`
        );
    }

    const turn = config.turns.find((candidate) => candidate.id === turnId);
    if (!turn) {
        throw new MatchError(
            "VALIDATION",
            `${where}: turn "${turnId}" is not part of round "${roundId}"`
        );
    }

    return { config, mode: turn.mode };
}


function copyOf(params: {
    source: BankRow;
    roundId: string;
    turnId: string;
    position: number;
    mode: "oral" | "text";
    points: number;
}): MatchQuestion {
    const { source, roundId, turnId, position, mode, points } = params;

    return {
        _id: randomUUID(),
        roundId,
        turnId,
        position,
        mode,
        kind: source.kind as QuestionKind,
        questionText: source.questionText,
        media: source.media ?? null,
        timeLimit: source.timeLimit,
        points,
        domain: source.domain ?? null,
        payload: source.payload,
        sourceId: source.id
    };
}


export async function buildQuestionCopies(params: {
    tournament: TournamentRow;
    roundConfigs: Record<string, RoundConfig>;
    entries: AssemblyEntry[];
}): Promise<MatchQuestion[]> {
    const { tournament, roundConfigs, entries } = params;

    const copies: MatchQuestion[] = [];
    const nextPosition = new Map<string, number>();
    const usedSourceIds = new Set<string>();

    const positionFor = (roundId: string, turnId: string, requested?: number): number => {
        if (requested !== undefined) return requested;

        const key = `${roundId}:${turnId}`;
        const next = nextPosition.get(key) ?? 0;
        nextPosition.set(key, next + 1);
        return next;
    };

    if (entries.length > 0) {
        const bankRows = await db
            .select()
            .from(questionBank)
            .where(inArray(questionBank.id, entries.map((entry) => entry.sourceId)));

        const bankById = new Map(bankRows.map((row) => [row.id, row]));

        for (const [index, entry] of entries.entries()) {
            const where = `questions[${index}]`;
            const { config, mode } = requireTurn({
                tournament,
                roundConfigs,
                roundId: entry.roundId,
                turnId: entry.turnId,
                where
            });

            const source = bankById.get(entry.sourceId);
            if (!source) {
                throw new MatchError("VALIDATION", `${where}: question ${entry.sourceId} does not exist`);
            }
            if (source.status !== "PUBLISHED") {
                throw new MatchError(
                    "VALIDATION",
                    `${where}: question ${entry.sourceId} is ${source.status}, not PUBLISHED`
                );
            }
            if (!config.allowedKinds.includes(source.kind as QuestionKind)) {
                throw new MatchError(
                    "VALIDATION",
                    `${where}: kind ${source.kind} is not allowed in round "${entry.roundId}"`,
                    [`allowed kinds: ${config.allowedKinds.join(", ")}`]
                );
            }

            usedSourceIds.add(source.id);
            copies.push(copyOf({
                source,
                roundId: entry.roundId,
                turnId: entry.turnId,
                position: positionFor(entry.roundId, entry.turnId, entry.position),
                mode,
                points: entry.points ?? basePoints(config.scoring)
            }));
        }
    }

    return copies;
}

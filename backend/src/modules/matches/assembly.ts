import { randomUUID } from "node:crypto";
import { and, inArray, notInArray, sql } from "drizzle-orm";
import { db } from "../../db/pool.js";
import { questionBank, tournaments } from "../../db/schema/index.js";
import type { MatchQuestion, RoundConfig, ScoringRule } from "../../game/contracts/index.js";
import { MatchError } from "./errors.js";
import { assemblyEligibility } from "../questions/service.js";
import type { AssemblyEntry, AutoPick } from "./schemas.js";

type TournamentRow = typeof tournaments.$inferSelect;
type BankRow = typeof questionBank.$inferSelect;
type QuestionKind = "MC" | "TEXT" | "KEYWORD";


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
        tag: source.tag,
        payload: source.payload,
        sourceId: source.id
    };
}


export async function buildQuestionCopies(params: {
    tournament: TournamentRow;
    roundConfigs: Record<string, RoundConfig>;
    entries: AssemblyEntry[];
    autoPick: AutoPick[];
}): Promise<MatchQuestion[]> {
    const { tournament, roundConfigs, entries, autoPick } = params;

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
            if (!tournament.tags.includes(source.tag)) {
                throw new MatchError(
                    "VALIDATION",
                    `${where}: question ${entry.sourceId} is not tagged for this tournament`
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

    for (const [index, request] of autoPick.entries()) {
        const where = `autoPick[${index}]`;
        const { config, mode } = requireTurn({
            tournament,
            roundConfigs,
            roundId: request.roundId,
            turnId: request.turnId,
            where
        });

        // Same visibility rule as the paged read: one place, two consumers.
        const conditions = [
            ...assemblyEligibility(tournament.tags),
            inArray(questionBank.kind, config.allowedKinds as QuestionKind[])
        ];

        if (usedSourceIds.size > 0) {
            conditions.push(notInArray(questionBank.id, [...usedSourceIds]));
        }

        const picked = await db
            .select()
            .from(questionBank)
            .where(and(...conditions))
            .orderBy(sql`random()`)
            .limit(request.count);

        if (picked.length < request.count) {
            throw new MatchError(
                "VALIDATION",
                `${where}: only ${picked.length} eligible question(s) for round "${request.roundId}" turn "${request.turnId}", ${request.count} requested`
            );
        }

        for (const source of picked) {
            usedSourceIds.add(source.id);
            copies.push(copyOf({
                source,
                roundId: request.roundId,
                turnId: request.turnId,
                position: positionFor(request.roundId, request.turnId),
                mode,
                points: basePoints(config.scoring)
            }));
        }
    }

    return copies;
}

import { and, inArray, notInArray, sql } from "drizzle-orm";
import { db } from "../../db/pool.js";
import { questionBank, seasons } from "../../db/schema/index.js";
import type { RoundConfig } from "../../game/contracts/index.js";
import type { AssemblyEntry } from "../matches/schemas.js";
import { assemblyEligibility } from "../questions/service.js";
import { QualificationError } from "./errors.js";

type SeasonRow = typeof seasons.$inferSelect;


export interface StageInputs {
    roundConfigs: Record<string, RoundConfig>;
    questions: AssemblyEntry[];
}

// The saved rules for this season's rounds. Every stage needs them, drawn or placed by hand.
export function stageRoundConfigs(season: SeasonRow): Record<string, RoundConfig> {
    const rules = season.roundRules ?? {};

    const missing = season.rounds.filter((round) => !rules[round.id]).map((round) => round.id);
    if (missing.length > 0) {
        throw new QualificationError(
            "NOT_SETUP",
            `these rounds have no saved rules for this season: ${missing.join(", ")}`,
            missing
        );
    }

    return rules;
}

export async function buildStageInputs(
    season: SeasonRow,
    tournamentId: string
): Promise<StageInputs> {
    const rules = stageRoundConfigs(season);

    const questions: AssemblyEntry[] = [];
    const picked: string[] = [];

    for (const round of [...season.rounds].sort((a, b) => a.order - b.order)) {
        const config = rules[round.id];

        for (const turn of config.turns) {
            const count = turn.questionCount ?? 0;
            if (count <= 0) continue;

            const conditions = [
                ...assemblyEligibility(tournamentId),
                inArray(questionBank.kind, config.allowedKinds as ("MC" | "TEXT" | "KEYWORD")[])
            ];
            if (picked.length > 0) conditions.push(notInArray(questionBank.id, picked));

            const rows = await db
                .select({ id: questionBank.id })
                .from(questionBank)
                .where(and(...conditions))
                .orderBy(sql`random()`)
                .limit(count);

            if (rows.length < count) {
                throw new QualificationError(
                    "NOT_ENOUGH_QUESTIONS",
                    `round "${round.id}" turn "${turn.id}" needs ${count} questions, the bank can supply ${rows.length}`
                );
            }

            rows.forEach((row, position) => {
                picked.push(row.id);
                questions.push({ roundId: round.id, turnId: turn.id, sourceId: row.id, position });
            });
        }
    }

    if (questions.length === 0) {
        throw new QualificationError("NOT_SETUP", "this season's rounds declare no questions");
    }

    return { roundConfigs: rules, questions };
}
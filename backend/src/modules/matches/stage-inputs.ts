// Assembling a match's questions from the season's rulebook: every turn asks for
// `questionCount` questions, taken from the bank and copied into the match, so a running
// event never depends on later bank edits.
import { and, inArray, notInArray, sql } from "drizzle-orm";
import { db } from "../../db/pool.js";
import { questionBank, seasons } from "../../db/schema/index.js";
import type { RoundConfig } from "../../game/contracts/index.js";
import type { AssemblyEntry } from "./schemas.js";
import { assemblyEligibility } from "../questions/service.js";
import { MatchError } from "./errors.js";

type SeasonRow = typeof seasons.$inferSelect;


export interface StageInputs {
    roundConfigs: Record<string, RoundConfig>;
    questions: AssemblyEntry[];
}

// The saved rules for this season's rounds. Every match needs them.
export function seasonRoundConfigs(season: SeasonRow): Record<string, RoundConfig> {
    const rules = season.roundRules ?? {};

    const missing = season.rounds.filter((round) => !rules[round.id]).map((round) => round.id);
    if (missing.length > 0) {
        throw new MatchError(
            "NOT_READY",
            `these rounds have no saved rules for this season: ${missing.join(", ")}`,
            missing
        );
    }

    return rules;
}

export async function buildStageInputs(
    season: SeasonRow,
    roundConfigs: Record<string, RoundConfig>
): Promise<StageInputs> {
    const questions: AssemblyEntry[] = [];
    const picked: string[] = [];

    for (const round of [...season.rounds].sort((a, b) => a.order - b.order)) {
        const config = roundConfigs[round.id];
        if (!config) continue;

        for (const turn of config.turns) {
            const count = turn.questionCount ?? 0;
            if (count <= 0) continue;

            const conditions = [
                ...assemblyEligibility(season.tags),
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
                throw new MatchError(
                    "NOT_READY",
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
        throw new MatchError("NOT_READY", "this season's rounds declare no questions");
    }

    return { roundConfigs, questions };
}

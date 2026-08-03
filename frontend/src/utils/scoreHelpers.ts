import type { RawScore } from "@/utils/playerHelpers";

export function getScoreValue(score: RawScore | null | undefined): number | undefined {
    if (!score) return undefined;
    const value = score.cummulative_score ?? score.total_score ?? score.score;
    return typeof value === "number" ? value : undefined;
}

export function findScore(scores: RawScore[], userCode: string): RawScore | undefined {
    return scores.find((score) => String(score.user_code ?? "") === userCode);
}

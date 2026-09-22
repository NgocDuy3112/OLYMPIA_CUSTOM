export type TournamentFormat = "oc3" | "oc4";

/** OC code helpers — canonical format is OC<number>_X_*. */
export const OC_MATCH_RE = /^OC(\d+)_M/;
export const OC_QUESTION_RE = /^OC(\d+)_Q/;
export const OC_TOURNAMENT_RE = /^OC(\d+)_T/;

export function ocNumberFromFormat(format?: string | null): string {
    const m = String(format ?? "")
        .trim()
        .toLowerCase()
        .match(/(\d+)/);
    return m ? m[1] : "3";
}

export function ocPrefixFromCode(code?: string | null): string {
    const m = String(code ?? "")
        .trim()
        .toUpperCase()
        .match(/^OC(\d+)/);
    return m ? `OC${m[1]}` : "OC3";
}

export function makeMatchCode(ocNumber: string | number, suffix: string): string {
    return `OC${ocNumber}_M_${suffix}`;
}

export function makeQuestionCode(
    ocNumber: string | number,
    suffix: string,
): string {
    return `OC${ocNumber}_Q_${suffix}`;
}

export function makeTournamentCode(
    ocNumber: string | number,
    suffix: string,
): string {
    return `OC${ocNumber}_T_${suffix}`;
}

export function questionPrefixForMatch(
    matchCode: string | null | undefined,
    round: string,
): string {
    return `${ocPrefixFromCode(matchCode)}_Q_${round}`;
}

export * from "./ws.js";

export type TournamentFormat = "oc3" | "oc4";

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

export * from "./ws.js";

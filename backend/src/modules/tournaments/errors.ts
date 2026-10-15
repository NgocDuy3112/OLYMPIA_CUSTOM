export type TournamentErrorCode = "VALIDATION" | "SLUG_TAKEN" | "NOT_FOUND";

export class TournamentError extends Error {
    constructor(
        public readonly code: TournamentErrorCode,
        message: string,
        public readonly details: string[] = []
    ) {
        super(message);
        this.name = "TournamentError";
    }
}

const STATUS_BY_CODE: Record<TournamentErrorCode, number> = {
    VALIDATION: 400,
    NOT_FOUND: 404,
    SLUG_TAKEN: 409
};

export function toHttpStatus(code: TournamentErrorCode): number {
    return STATUS_BY_CODE[code];
}

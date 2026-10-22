// One error type for the tournament's own flows: the roster, the mass event and the standings.
export type TournamentErrorCode =
    | "VALIDATION"
    | "NOT_FOUND"
    | "CONFLICT"
    | "FORBIDDEN"
    | "ALREADY_SETUP"
    | "NOT_SETUP"
    | "CLOSED"
    | "ALREADY_ANSWERED"
    | "NOT_ENROLLED"
    | "NOT_ENOUGH_PLAYERS"
    | "TIES_UNRESOLVED"
    | "NOT_ENOUGH_QUESTIONS";

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
    CONFLICT: 409,
    FORBIDDEN: 403,
    ALREADY_SETUP: 409,
    NOT_SETUP: 409,
    CLOSED: 409,
    ALREADY_ANSWERED: 409,
    NOT_ENROLLED: 403,
    NOT_ENOUGH_PLAYERS: 409,
    TIES_UNRESOLVED: 409,
    NOT_ENOUGH_QUESTIONS: 409
};

export function toHttpStatus(code: TournamentErrorCode): number {
    return STATUS_BY_CODE[code];
}

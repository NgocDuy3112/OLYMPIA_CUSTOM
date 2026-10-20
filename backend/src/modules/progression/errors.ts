export type ProgressionErrorCode =
    | "VALIDATION"
    | "NOT_FOUND"
    | "FORBIDDEN"
    | "NO_PROGRESSION"
    | "ALREADY_SETUP"
    | "NOT_SETUP"
    | "CLOSED"
    | "NOT_ENROLLED"
    | "NOT_ENOUGH_PLAYERS"
    | "TIES_UNRESOLVED";

export class QualificationError extends Error {
    constructor(
        public readonly code: ProgressionErrorCode,
        message: string,
        public readonly details: string[] = []
    ) {
        super(message);
        this.name = "QualificationError";
    }
}

const STATUS: Record<ProgressionErrorCode, number> = {
    VALIDATION: 400,
    NOT_FOUND: 404,
    FORBIDDEN: 403,
    NO_PROGRESSION: 409,
    ALREADY_SETUP: 409,
    NOT_SETUP: 409,
    CLOSED: 409,
    NOT_ENROLLED: 403,
    NOT_ENOUGH_PLAYERS: 409,
    TIES_UNRESOLVED: 409
};

export function toHttpStatus(code: ProgressionErrorCode): number {
    return STATUS[code];
}

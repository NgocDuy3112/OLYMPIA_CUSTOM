export type MatchErrorCode =
    | "VALIDATION"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "INVALID_TRANSITION"
    | "IMMUTABLE"
    | "NOT_READY";

export class MatchError extends Error {
    constructor(
        public readonly code: MatchErrorCode,
        message: string,
        public readonly details: string[] = []
    ) {
        super(message);
        this.name = "MatchError";
    }
}

const STATUS_BY_CODE: Record<MatchErrorCode, number> = {
    VALIDATION: 400,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    INVALID_TRANSITION: 409,
    IMMUTABLE: 409,
    NOT_READY: 409
};

export function toHttpStatus(code: MatchErrorCode): number {
    return STATUS_BY_CODE[code];
}

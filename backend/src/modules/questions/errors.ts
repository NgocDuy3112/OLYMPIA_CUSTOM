export type QuestionErrorCode =
    | "VALIDATION"
    | "NOT_FOUND"
    | "FORBIDDEN"
    | "INVALID_TRANSITION"
    | "IMMUTABLE";

export class QuestionError extends Error {
    constructor(
        public readonly code: QuestionErrorCode,
        message: string,
        public readonly details: string[] = []
    ) {
        super(message);
        this.name = "QuestionError";
    }
}

const STATUS_BY_CODE: Record<QuestionErrorCode, number> = {
    VALIDATION: 400,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    INVALID_TRANSITION: 409,
    IMMUTABLE: 409
};

export function toHttpStatus(code: QuestionErrorCode): number {
    return STATUS_BY_CODE[code];
}

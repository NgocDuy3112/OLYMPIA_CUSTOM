export type CodeErrorCode =
    | "VALIDATION"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "CONFLICT";

export class CodeError extends Error {
    constructor(
        public readonly code: CodeErrorCode,
        message: string,
        public readonly details: string[] = []
    ) {
        super(message);
        this.name = "CodeError";
    }
}

const STATUS_BY_CODE: Record<CodeErrorCode, number> = {
    VALIDATION: 400,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    CONFLICT: 409
};

export function toHttpStatus(code: CodeErrorCode): number {
    return STATUS_BY_CODE[code];
}

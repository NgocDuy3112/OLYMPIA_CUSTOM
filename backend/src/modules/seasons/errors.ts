export type SeasonErrorCode = "VALIDATION" | "NOT_FOUND";

export class SeasonError extends Error {
    constructor(
        public readonly code: SeasonErrorCode,
        message: string,
        public readonly details: string[] = []
    ) {
        super(message);
        this.name = "SeasonError";
    }
}

const STATUS_BY_CODE: Record<SeasonErrorCode, number> = {
    VALIDATION: 400,
    NOT_FOUND: 404
};

export function toHttpStatus(code: SeasonErrorCode): number {
    return STATUS_BY_CODE[code];
}
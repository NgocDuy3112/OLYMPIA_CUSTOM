export type McpKeyErrorCode = "VALIDATION" | "UNAUTHORIZED" | "FORBIDDEN" | "NOT_FOUND";

export class McpKeyError extends Error {
    constructor(
        public readonly code: McpKeyErrorCode,
        message: string,
        public readonly details: string[] = []
    ) {
        super(message);
        this.name = "McpKeyError";
    }
}

const STATUS_BY_CODE: Record<McpKeyErrorCode, number> = {
    VALIDATION: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404
};

export function toHttpStatus(code: McpKeyErrorCode): number {
    return STATUS_BY_CODE[code];
}

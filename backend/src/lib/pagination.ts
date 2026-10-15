// Offset pagination shared by list endpoints.
//
// Note: ajv runs with coerceTypes: false, so query values arrive as strings —
// the parse happens here rather than in route schemas.

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

export class PaginationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "PaginationError";
    }
}

export interface Page {
    limit: number;
    offset: number;
}

export interface PageResult<T> {
    items: T[];
    total: number;
    limit: number;
    offset: number;
}

const DIGITS_ONLY = /^\d+$/;

function parseCount(raw: unknown, field: string, fallback: number): number {
    if (raw === undefined || raw === "") return fallback;
    if (typeof raw !== "string" || !DIGITS_ONLY.test(raw)) {
        throw new PaginationError(`${field} must be a non-negative integer`);
    }
    return Number(raw);
}

export function parsePage(query: unknown): Page {
    const q = (query ?? {}) as { limit?: unknown; offset?: unknown };

    const limit = parseCount(q.limit, "limit", DEFAULT_LIMIT);
    const offset = parseCount(q.offset, "offset", 0);

    if (limit < 1 || limit > MAX_LIMIT) {
        throw new PaginationError(`limit must be between 1 and ${MAX_LIMIT}`);
    }

    return { limit, offset };
}

export function pageResult<T>(items: T[], total: number, page: Page): PageResult<T> {
    return { items, total, limit: page.limit, offset: page.offset };
}

// Optimistic concurrency for live MC actions. Pure: no DB.
// An action carries the version it was based on. If the stored version has moved on,
// the action is rejected (HTTP 409) and the console must reload before retrying.

export class LiveConflictError extends Error {
    constructor(
        public readonly expectedVersion: number,
        public readonly currentVersion: number
    ) {
        super(
            `state is out of date: you acted on version ${expectedVersion}, ` +
            `current is ${currentVersion}. Reload and retry.`
        );
        this.name = "LiveConflictError";
    }
}

export function assertVersion(expected: number, current: number): void {
    if (!Number.isInteger(expected) || expected < 0) {
        throw new RangeError(`expected version must be a non-negative integer, got ${expected}`);
    }
    if (expected !== current) {
        throw new LiveConflictError(expected, current);
    }
}

export function nextVersion(current: number): number {
    return current + 1;
}

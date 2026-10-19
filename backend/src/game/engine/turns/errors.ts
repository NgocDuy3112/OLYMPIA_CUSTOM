// Shared rule-violation error for all turn modules.
export class RuleError extends Error {
    constructor(public readonly code: string, message: string) {
        super(message);
    }
}

export function fail(code: string, message: string): never {
    throw new RuleError(code, message);
}

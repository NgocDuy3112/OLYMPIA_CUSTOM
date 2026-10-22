// Raised when a rule the engine follows cannot be satisfied by the input it was given:
// a tie-break that names an unknown player, a draw with the wrong number of players, a
// ladder round with no matches.
export class SeasonRuleError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "SeasonRuleError";
    }
}

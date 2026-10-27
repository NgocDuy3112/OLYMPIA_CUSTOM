// Raised when a rule the engine follows cannot be satisfied by the input it was given:
// a draw with the wrong number of players, a ladder round with no matches.
export class TournamentRuleError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "TournamentRuleError";
    }
}

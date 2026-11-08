export class TournamentRuleError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "TournamentRuleError";
    }
}

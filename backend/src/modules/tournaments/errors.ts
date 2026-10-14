export type TournamentErrorCode = "VALIDATION" | "SLUG_TAKEN" | "NOT_FOUND";

export class TournamentError extends Error {
    constructor(
        public readonly code: TournamentErrorCode,
        message: string,
        public readonly details: string[] = []
    ) {
        super(message);
        this.name = "TournamentError";
    }
}
import type { Seat } from "../../game/contracts/index.js";

// A player is seated in a match when one of its seats names them as a user.
export function isSeatedInMatch(seats: Seat[], userId: string): boolean {
    return seats.some((seat) => seat.kind === "user" && seat.userId === userId);
}

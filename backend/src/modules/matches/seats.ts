import type { Seat } from "../../game/contracts/index.js";

export function isSeatedInMatch(seats: Seat[], userId: string): boolean {
    return seats.some((seat) => seat.kind === "user" && seat.userId === userId);
}

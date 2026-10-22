// Bits the season's own routes share: the error shape, the route params, and who may
// write to a season.
import type { FastifyInstance } from "fastify";
import { requireRole } from "../lib/guards.js";
import { canViewSeason, canWriteSeason } from "../lib/season-access.js";
import { SeasonError, toHttpStatus } from "./seasons/errors.js";

export const UUID_PATTERN = "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$";

export const seasonParams = {
    type: "object",
    required: ["seasonId"],
    additionalProperties: false,
    properties: { seasonId: { type: "string", pattern: UUID_PATTERN } }
} as const;

export const matchParams = {
    type: "object",
    required: ["matchId"],
    additionalProperties: false,
    properties: { matchId: { type: "string", pattern: UUID_PATTERN } }
} as const;

export function seasonErrorHandler(app: FastifyInstance): void {
    app.setErrorHandler((error: unknown, _request, reply) => {
        if (error instanceof SeasonError) {
            reply.code(toHttpStatus(error.code)).send({
                error: error.code,
                message: error.message,
                ...(error.details.length > 0 && { details: error.details })
            });
            return;
        }
        reply.send(error);
    });
}

// The staff of the portal.
export function seasonGuards() {
    const staff = [requireRole("PORTAL", ["ADMIN", "OPERATOR"])];

    async function assertWrite(seasonId: string, userId: string, role: string) {
        const { getSeason } = await import("./seasons/service.js");
        const season = await getSeason(seasonId);
        if (!canWriteSeason(season, { id: userId, role } as never)) {
            throw new SeasonError("FORBIDDEN", "only the owner or an admin may manage this season");
        }
        return season;
    }

    async function assertView(seasonId: string, userId: string, role: string) {
        const { getSeason } = await import("./seasons/service.js");
        const season = await getSeason(seasonId);
        if (!canViewSeason(season, { id: userId, role } as never)) {
            throw new SeasonError("NOT_FOUND", "season not found");
        }
        return season;
    }

    return { staff, assertWrite, assertView };
}

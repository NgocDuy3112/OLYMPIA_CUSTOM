import type { FastifyInstance } from "fastify";
import { Type } from "@sinclair/typebox";
import { inArray, sql } from "drizzle-orm";
import { db } from "../../db/pool.js";
import { matchAssemblyEvents } from "../../db/schema/index.js";
import { canViewTournament, canWriteTournament } from "../../lib/tournament-access.js";
import { requireRole } from "../../lib/guards.js";
import { slotConflict } from "../questions/buckets.js";
import { MatchError, toHttpStatus } from "./errors.js";
import { AssemblyEntry, validate } from "./schemas.js";
import { buildQuestionCopies } from "./assembly.js";
import { getMatch, requireMatchScope } from "./service.js";

export const PatchAssembleBody = Type.Object(
    {
        questions: Type.Optional(Type.Array(AssemblyEntry)),
        baseRevision: Type.Integer({ minimum: 0 })
    },
    { additionalProperties: false }
);

export type PatchAssembleBody = {
    questions?: Array<{
        roundId: string;
        turnId: string;
        sourceId: string;
        position?: number;
        points?: number;
    }>;
    baseRevision: number;
};

export class StaleRevisionError extends Error {
    constructor(
        public readonly currentRevision: number,
        public readonly sentRevision: number
    ) {
        super(
            `stale baseRevision ${sentRevision} — the match is at revision ${currentRevision}; reload and merge`
        );
        this.name = "StaleRevisionError";
    }
}

export interface PatchAssembleResult {
    assemblyRevision: number;
    added: number;
    removed: number;
}

interface RawSourceRow {
    id: string;
    kind: string;
    keyword_id: string | null;
    full: Record<string, unknown>;
}

async function assertBuckets(
    entries: NonNullable<PatchAssembleBody["questions"]>
): Promise<void> {
    const sourceIds = [...new Set(entries.map((entry) => entry.sourceId))];
    if (sourceIds.length === 0) return;

    const result = await db.execute(sql`
        SELECT q.id, q.kind, q.keyword_id, to_jsonb(q) AS full
          FROM question_bank q
         WHERE ${inArray(sql`q.id`, sourceIds)}
    `);
    const rows = result.rows as unknown as RawSourceRow[];
    const byId = new Map(rows.map((row) => [row.id, row]));

    const migrated = rows.some((row) => typeof row.full?.tags !== "undefined");
    if (!migrated) return; 

    for (const [index, entry] of entries.entries()) {
        const source = byId.get(entry.sourceId);
        if (!source) continue; 

        const rawType = typeof source.full.type === "string" ? source.full.type : source.kind;
        const conflict = slotConflict(
            { roundId: entry.roundId, turnId: entry.turnId, points: entry.points },
            {
                tags: Array.isArray(source.full.tags) ? (source.full.tags as string[]) : [],
                type: rawType === "HINT" ? "TEXT" : rawType, // legacy kind → type (§2.1)
                keywordId: source.keyword_id
            }
        );
        if (conflict) {
            throw new MatchError("VALIDATION", `questions[${index}]: ${conflict}`);
        }
    }
}

function diffCounts(
    oldIds: string[],
    newIds: string[]
): { added: number; removed: number } {
    const remaining = new Map<string, number>();
    for (const id of oldIds) remaining.set(id, (remaining.get(id) ?? 0) + 1);
    let added = 0;
    for (const id of newIds) {
        const left = remaining.get(id) ?? 0;
        if (left > 0) remaining.set(id, left - 1);
        else added += 1;
    }
    const removed = [...remaining.values()].reduce((sum, count) => sum + count, 0);
    return { added, removed };
}

export async function patchAssemble(
    tournamentId: string,
    matchId: string,
    input: PatchAssembleBody,
    actorId: string
): Promise<PatchAssembleResult> {
    validate(PatchAssembleBody, input);

    const existing = await getMatch(tournamentId, matchId);
    if (existing.status !== "UPCOMING") {
        throw new MatchError(
            "IMMUTABLE",
            `match ${matchId} is ${existing.status} and can no longer be assembled`
        );
    }

    const entries = input.questions ?? [];
    await assertBuckets(entries);

    const scope = await requireMatchScope(tournamentId);
    const copies = await buildQuestionCopies({
        tournament: scope.tournament,
        roundConfigs: existing.roundConfigs,
        entries
    });

    const oldIds = (existing.questions as Array<{ sourceId?: string }>)
        .map((question) => question.sourceId)
        .filter((id): id is string => typeof id === "string");
    const counts = diffCounts(oldIds, entries.map((entry) => entry.sourceId));

    const result = await db.transaction(async (tx) => {
        const updated = (await tx.execute(sql`
            UPDATE matches
               SET questions = ${JSON.stringify(copies)}::jsonb,
                   assembly_revision = assembly_revision + 1,
                   assembled_at = now(),
                   updated_at = now()
             WHERE id = ${matchId}
               AND tournament_id = ${tournamentId}
               AND deleted_at IS NULL
               AND status = 'UPCOMING'
               AND assembly_revision = ${input.baseRevision}
         RETURNING assembly_revision
        `)) as unknown as { rows: Array<{ assembly_revision: number }> };

        if (updated.rows.length === 0) {
            const probe = (await tx.execute(sql`
                SELECT status, assembly_revision
                  FROM matches
                 WHERE id = ${matchId} AND tournament_id = ${tournamentId} AND deleted_at IS NULL
            `)) as unknown as { rows: Array<{ status: string; assembly_revision: number }> };
            const current = probe.rows[0];
            if (!current) throw new MatchError("NOT_FOUND", `match ${matchId} not found`);
            if (current.status !== "UPCOMING") {
                throw new MatchError(
                    "IMMUTABLE",
                    `match ${matchId} is ${current.status} and can no longer be assembled`
                );
            }
            throw new StaleRevisionError(current.assembly_revision, input.baseRevision);
        }

        const revision = updated.rows[0].assembly_revision;
        await tx.insert(matchAssemblyEvents).values({
            matchId,
            revision,
            actorId,
            mode: "replace",
            addedCount: counts.added,
            removedCount: counts.removed,
            sourceIds: entries.map((entry) => entry.sourceId)
        });
        return { revision };
    });

    return {
        assemblyRevision: result.revision,
        added: counts.added,
        removed: counts.removed
    };
}


const UUID_PATTERN = "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$";

const matchParams = {
    type: "object",
    required: ["tournamentId", "matchId"],
    additionalProperties: false,
    properties: {
        tournamentId: { type: "string", pattern: UUID_PATTERN },
        matchId: { type: "string", pattern: UUID_PATTERN }
    }
} as const;

export function assemblePatchRoutes(app: FastifyInstance) {
    const staff = [requireRole("PORTAL", ["ADMIN", "OPERATOR"])];

    app.patch(
        "/portal/tournaments/:tournamentId/matches/:matchId/assemble",
        {
            onRequest: staff,
            schema: { params: matchParams, body: PatchAssembleBody }
        },
        async (request, reply) => {
            const user = request.sessionUser!;
            const { tournamentId, matchId } = request.params as {
                tournamentId: string;
                matchId: string;
            };

            try {
                const scope = await requireMatchScope(tournamentId);
                if (!canViewTournament(scope.tournament, user as never)) {
                    throw new MatchError("NOT_FOUND", `tournament ${tournamentId} not found`);
                }
                if (!canWriteTournament(scope.tournament, user as never)) {
                    throw new MatchError(
                        "FORBIDDEN",
                        "Only the owner or an admin may manage this tournament's matches"
                    );
                }

                const result = await patchAssemble(
                    tournamentId,
                    matchId,
                    request.body as PatchAssembleBody,
                    user.id
                );
                reply.code(200).send({ assemblyRevision: result.assemblyRevision });
            } catch (error) {
                if (error instanceof StaleRevisionError) {
                    reply.code(409).send({
                        error: "CONFLICT",
                        message: error.message,
                        currentRevision: error.currentRevision
                    });
                    return;
                }
                if (error instanceof MatchError) {
                    reply.code(toHttpStatus(error.code)).send({
                        error: error.code,
                        message: error.message,
                        ...(error.details.length > 0 && { details: error.details })
                    });
                    return;
                }
                throw error;
            }
        }
    );
}

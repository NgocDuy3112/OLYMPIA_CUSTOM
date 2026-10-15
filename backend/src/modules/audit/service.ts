import type { FastifyRequest } from "fastify";
import { db } from "../../db/pool.js";
import { auditEvents } from "../../db/schema/index.js";

// The doc's action vocabulary, plus the few our current code genuinely needs.
// Deliberately absent: per-question open/close (doc's volume rule — that state
// is recoverable from matches.live) and any content-only edit.
export type AuditAction =
    // doc list
    | "totp_reset"
    | "operator_disabled"
    | "match_started"
    | "question_abandoned"
    | "paused"
    | "answer_drafted"
    | "answer_judged"
    | "match_ended"
    | "season_closed"
    | "season_tie_accepted"
    | "discord_link_transferred"
    | "mcp_tool_call"
    // additions this codebase needs now
    | "mcp_key_issued"
    | "mcp_key_revoked"
    | "question_submitted"
    | "question_published"
    | "question_archived";

export interface AuditEvent {
    action: AuditAction;
    actorId?: string | null;
    targetId?: string | null;      // audit_events.target_id references users
    matchId?: string | null;
    details?: Record<string, unknown> | null;
    ip?: string | null;
    userAgent?: string | null;
}

// Best-effort by design: audit is observability, so a failing insert must never
// break the operation it is recording. Callers still await, so tests and
// ordering stay deterministic.
export async function audit(event: AuditEvent): Promise<void> {
    try {
        await db.insert(auditEvents).values({
            action: event.action,
            actorId: event.actorId ?? null,
            targetId: event.targetId ?? null,
            matchId: event.matchId ?? null,
            details: event.details ?? null,
            ip: event.ip ?? null,
            userAgent: event.userAgent ?? null
        });
    } catch (error) {
        console.error(`audit write failed for "${event.action}"`, error);
    }
}

export async function auditFromRequest(
    request: FastifyRequest,
    action: AuditAction,
    extra: Partial<Omit<AuditEvent, "action">> = {}
): Promise<void> {
    await audit({
        action,
        actorId: request.sessionUser?.id ?? null,
        ip: request.ip ?? null,
        userAgent: request.headers["user-agent"] ?? null,
        ...extra
    });
}

// Doc convention: every mcp_tool_call names its key in details.mcpKeyId.
export function mcpAuditDetails(
    mcpKeyId: string,
    extra: Record<string, unknown> = {}
): Record<string, unknown> {
    return { mcpKeyId, ...extra };
}

import { and, count, desc, eq } from "drizzle-orm";
import { db } from "../../db/pool.js";
import { mcpKeys, users } from "../../db/schema/index.js";
import { McpKeyError } from "./errors.js";
import { generateMcpKey, hashMcpKey, parseMcpKey } from "./keys.js";
import { CreateMcpKeyInput, validate } from "./schemas.js";
import { pageResult, type Page, type PageResult } from "../../lib/pagination.js";

type McpKeyRow = typeof mcpKeys.$inferSelect;
type UserRow = typeof users.$inferSelect;

export type PublicMcpKey = Omit<McpKeyRow, "keyHash">;

// key_hash never leaves the API — not even for the owner (doc: sha256, shown once).
const publicColumns = {
    id: mcpKeys.id,
    userId: mcpKeys.userId,
    label: mcpKeys.label,
    prefix: mcpKeys.prefix,
    scopes: mcpKeys.scopes,
    expiresAt: mcpKeys.expiresAt,
    createdAt: mcpKeys.createdAt,
    lastUsedAt: mcpKeys.lastUsedAt,
    lastIp: mcpKeys.lastIp,
    lastUserAgent: mcpKeys.lastUserAgent,
    revokedAt: mcpKeys.revokedAt
};


export interface IssuedMcpKey {
    token: string;          // returned exactly once
    key: PublicMcpKey;
}


export async function createMcpKey(
    userId: string,
    input: CreateMcpKeyInput
): Promise<IssuedMcpKey> {
    validate(CreateMcpKeyInput, input);

    const scopes = input.scopes ?? ["READ"];
    if (new Set(scopes).size !== scopes.length) {
        throw new McpKeyError("VALIDATION", "scopes must be unique");
    }

    const { token, prefix, keyHash } = generateMcpKey();

    const [key] = await db
        .insert(mcpKeys)
        .values({
            userId,
            label: input.label,
            prefix,
            keyHash,
            scopes,
            expiresAt: input.expiresAt ? new Date(input.expiresAt) : null
        })
        .returning(publicColumns);

    return { token, key };
}


export interface ListFilters {
    userId?: string;
}

export async function listMcpKeys(
    filters: ListFilters,
    page: Page
): Promise<PageResult<PublicMcpKey>> {
    const conditions = filters.userId ? [eq(mcpKeys.userId, filters.userId)] : [];
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [totals] = await db.select({ total: count() }).from(mcpKeys).where(where);

    const items = await db
        .select(publicColumns)
        .from(mcpKeys)
        .where(where)
        .orderBy(desc(mcpKeys.createdAt), desc(mcpKeys.id))
        .limit(page.limit)
        .offset(page.offset);

    return pageResult(items, Number(totals?.total ?? 0), page);
}


// Revocation is the instant kill (doc) and is never undone — a revoked key is
// replaced, not restored. Repeat calls are idempotent.
export async function revokeMcpKey(
    id: string,
    options: { userId?: string } = {}
): Promise<PublicMcpKey> {
    const conditions = [eq(mcpKeys.id, id)];
    if (options.userId) conditions.push(eq(mcpKeys.userId, options.userId));

    const [existing] = await db
        .select(publicColumns)
        .from(mcpKeys)
        .where(and(...conditions))
        .limit(1);

    if (!existing) throw new McpKeyError("NOT_FOUND", `MCP key ${id} not found`);
    if (existing.revokedAt) return existing;

    const [row] = await db
        .update(mcpKeys)
        .set({ revokedAt: new Date() })
        .where(eq(mcpKeys.id, id))
        .returning(publicColumns);

    return row;
}


export interface VerifiedMcpKey {
    key: PublicMcpKey;
    user: UserRow;
}

export async function verifyMcpToken(
    token: string,
    context: { ip?: string; userAgent?: string } = {}
): Promise<VerifiedMcpKey> {
    const unauthorized = (message: string): never => {
        throw new McpKeyError("UNAUTHORIZED", message);
    };

    if (!parseMcpKey(token)) unauthorized("Malformed MCP key");

    const [key] = await db
        .select(publicColumns)
        .from(mcpKeys)
        .where(eq(mcpKeys.keyHash, hashMcpKey(token)))
        .limit(1);

    if (!key) unauthorized("Unknown MCP key");
    if (key.revokedAt) unauthorized("MCP key revoked");
    if (key.expiresAt && key.expiresAt.getTime() <= Date.now()) {
        unauthorized("MCP key expired");
    }

    const [user] = await db.select().from(users).where(eq(users.id, key.userId)).limit(1);
    if (!user) unauthorized("Account not found");
    if (user.disabledAt) unauthorized("Account disabled");

    // Doc: last_used_at on every call; last_ip / last_user_agent on change only.
    const updates: Partial<typeof mcpKeys.$inferInsert> = { lastUsedAt: new Date() };
    if (context.ip && context.ip !== key.lastIp) updates.lastIp = context.ip;
    if (context.userAgent && context.userAgent !== key.lastUserAgent) {
        updates.lastUserAgent = context.userAgent;
    }

    await db.update(mcpKeys).set(updates).where(eq(mcpKeys.id, key.id));

    return { key, user };
}

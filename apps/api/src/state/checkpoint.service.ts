/**
 * Checkpoint service — periodic Valkey snapshot persistence.
 *
 * Every 30s: for each active match (snapshot:* key), dump full hash
 * to match_checkpoints. Keep latest 10 per match.
 */

import type { FastifyInstance } from "fastify";
import type Redis from "ioredis";
import { desc, eq, sql } from "drizzle-orm";
import { db, matches, matchCheckpoints } from "@oc/db";

const CHECKPOINT_INTERVAL_MS = 30_000;
const KEEP_PER_MATCH = 10;

async function snapshotActiveMatches(valkey: Redis): Promise<number> {
  let cursor = "0";
  let saved = 0;
  do {
    const [next, keys] = await valkey.scan(
      cursor,
      "MATCH",
      "snapshot:*",
      "COUNT",
      100,
    );
    cursor = next;
    for (const key of keys) {
      const matchCode = key.slice("snapshot:".length);
      const data = await valkey.hgetall(key);
      if (Object.keys(data).length === 0) continue;
      // Parse JSON fields back to objects for clean JSONB storage
      const checkpoint: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(data)) {
        try {
          checkpoint[k] = JSON.parse(v);
        } catch {
          checkpoint[k] = v;
        }
      }
      await db.insert(matchCheckpoints).values({ matchCode, checkpoint });
      saved++;
      // Prune: keep latest KEEP_PER_MATCH
      const rows = await db
        .select({ id: matchCheckpoints.id })
        .from(matchCheckpoints)
        .where(eq(matchCheckpoints.matchCode, matchCode))
        .orderBy(desc(matchCheckpoints.createdAt))
        .offset(KEEP_PER_MATCH);
      for (const row of rows) {
        await db
          .delete(matchCheckpoints)
          .where(eq(matchCheckpoints.id, row.id));
      }
    }
  } while (cursor !== "0");
  return saved;
}

export function startCheckpointJob(
  app: FastifyInstance,
): { stop: () => void } {
  const valkey = app.valkey as Redis;
  let stopped = false;
  let timer: ReturnType<typeof setInterval> | null = null;

  const tick = async () => {
    if (stopped) return;
    try {
      const saved = await snapshotActiveMatches(valkey);
      if (saved > 0) app.log.info({ saved }, "Checkpoints saved");
    } catch (err) {
      app.log.error({ err }, "Checkpoint job failed");
    }
  };

  // First run after 30s, then every 30s
  timer = setInterval(() => void tick(), CHECKPOINT_INTERVAL_MS);
  timer.unref?.();

  return {
    stop: () => {
      stopped = true;
      if (timer) clearInterval(timer);
    },
  };
}

/** Restore a match snapshot from its latest checkpoint. */
export async function restoreFromCheckpoint(
  valkey: Redis,
  matchCode: string,
): Promise<boolean> {
  const rows = await db
    .select({ checkpoint: matchCheckpoints.checkpoint })
    .from(matchCheckpoints)
    .where(eq(matchCheckpoints.matchCode, matchCode))
    .orderBy(desc(matchCheckpoints.createdAt))
    .limit(1);
  if (rows.length === 0) return false;
  const checkpoint = rows[0].checkpoint as Record<string, unknown>;
  const key = `snapshot:${matchCode}`;
  const pipeline = valkey.pipeline();
  for (const [field, value] of Object.entries(checkpoint)) {
    pipeline.hset(
      key,
      field,
      typeof value === "string" ? value : JSON.stringify(value),
    );
  }
  pipeline.expire(key, 3 * 60 * 60);
  await pipeline.exec();
  return true;
}

/** Verify match_code exists (FK-style guard since checkpoints use code, not id). */
export async function matchCodeExists(matchCode: string): Promise<boolean> {
  const rows = await db
    .select({ id: matches.id })
    .from(matches)
    .where(eq(matches.matchCode, matchCode))
    .limit(1);
  return rows.length > 0;
}

export async function checkpointCount(matchCode: string): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)` })
    .from(matchCheckpoints)
    .where(eq(matchCheckpoints.matchCode, matchCode));
  return Number(rows[0]?.count ?? 0);
}

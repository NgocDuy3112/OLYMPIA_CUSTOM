/**
 * Checkpoint service — periodic Valkey snapshot persistence.
 *
 * Every 30s: for each active match (snapshot:* key), dump full hash
 * to match_checkpoints. Keep latest 10 per match.
 */

import type { FastifyInstance } from "fastify";
import type Redis from "ioredis";
import {
  drizzleCheckpointRepo,
  type CheckpointRepo,
} from "../modules/checkpoint/checkpoint.repo.js";

const CHECKPOINT_INTERVAL_MS = 30_000;
const KEEP_PER_MATCH = 10;

async function snapshotActiveMatches(
  valkey: Redis,
  opts: { repo?: CheckpointRepo } = {},
): Promise<number> {
  const repo = opts.repo ?? drizzleCheckpointRepo;
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
      await repo.insert(matchCode, checkpoint);
      saved++;
      // Prune: keep latest KEEP_PER_MATCH
      await repo.pruneKeepLatest(matchCode, KEEP_PER_MATCH);
    }
  } while (cursor !== "0");
  return saved;
}

export function startCheckpointJob(
  app: FastifyInstance,
  opts: { repo?: CheckpointRepo } = {},
): { stop: () => void } {
  const valkey = app.valkey as Redis;
  const repo = opts.repo ?? drizzleCheckpointRepo;
  let stopped = false;
  let timer: ReturnType<typeof setInterval> | null = null;

  const tick = async () => {
    if (stopped) return;
    try {
      const saved = await snapshotActiveMatches(valkey, { repo });
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
  opts: { repo?: CheckpointRepo } = {},
): Promise<boolean> {
  const repo = opts.repo ?? drizzleCheckpointRepo;
  const checkpoint = await repo.latest(matchCode);
  if (!checkpoint) return false;
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
export async function matchCodeExists(
  matchCode: string,
  opts: { repo?: CheckpointRepo } = {},
): Promise<boolean> {
  const repo = opts.repo ?? drizzleCheckpointRepo;
  return repo.matchCodeExists(matchCode);
}

export async function checkpointCount(
  matchCode: string,
  opts: { repo?: CheckpointRepo } = {},
): Promise<number> {
  const repo = opts.repo ?? drizzleCheckpointRepo;
  return repo.count(matchCode);
}

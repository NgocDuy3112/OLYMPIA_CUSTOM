import { ApiError, apiGet } from "@/api/client";
import { normalizePlayerSnapshot } from "@/utils/playerHelpers";
import type { RawPlayer, RawProfile, RawScore } from "@/utils/playerHelpers";

type Snapshot = {
  players: RawPlayer[];
  scoreboard: RawScore[];
  profiles: RawProfile[];
};

type CacheEntry = { promise: Promise<Snapshot>; expiresAt: number };

const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 1500;

/**
 * Giữ nguyên thông báo lỗi của bản fetch thô: đọc `detail` của API,
 * không có thì dùng fallback; lỗi mạng ném thẳng ra ngoài.
 */
function snapshotError(error: unknown, fallback: string): Error {
  if (error instanceof ApiError) {
    const body = error.details;
    const detail =
      body && typeof body === "object"
        ? (body as { detail?: unknown }).detail
        : undefined;
    return new Error(typeof detail === "string" && detail ? detail : fallback);
  }
  if (error instanceof Error) return error;
  return new Error(fallback);
}

export async function loadControllerPlayersSnapshot(
  matchCode: string,
  force = false,
): Promise<Snapshot> {
  const key = matchCode;
  const existing = cache.get(key);
  if (!force && existing && existing.expiresAt > Date.now())
    return existing.promise;

  const playersRequest = apiGet<{ players?: unknown }>(
    `/matches/${encodeURIComponent(matchCode)}/players`,
  ).catch((error: unknown) => {
    throw snapshotError(error, "Failed to load players");
  });
  const scoreboardRequest = apiGet<{ scoreboard?: unknown }>(
    `/scoreboard/${encodeURIComponent(matchCode)}`,
  ).catch((error: unknown) => {
    throw snapshotError(error, "Failed to load scoreboard");
  });

  const promise = Promise.all([playersRequest, scoreboardRequest]).then(
    ([playersJson, scoreboardJson]) => {
      const snapshot = normalizePlayerSnapshot({
        players: playersJson.data?.players,
        scoreboard: scoreboardJson.data?.scoreboard,
      });
      const profiles = snapshot.players.map((entry) => ({
        user_code: entry.user_code,
        user_name: entry.user_name ?? "",
      }));
      return { ...snapshot, profiles };
    },
  );

  cache.set(key, { promise, expiresAt: Date.now() + CACHE_TTL });
  try {
    return await promise;
  } catch (error) {
    cache.delete(key);
    throw error;
  }
}

export function invalidateControllerPlayersSnapshot(matchCode?: string): void {
  if (!matchCode) {
    cache.clear();
    return;
  }
  for (const key of cache.keys()) {
    if (key.startsWith(`${matchCode}:`)) cache.delete(key);
  }
}

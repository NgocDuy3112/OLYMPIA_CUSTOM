import { API_BASE_URL } from "@/configs";
import { normalizePlayerSnapshot } from "@/utils/playerHelpers";
import type { RawPlayer, RawProfile, RawScore } from "@/utils/playerHelpers";

type Snapshot = { players: RawPlayer[]; scoreboard: RawScore[]; profiles: RawProfile[] };

type CacheEntry = { promise: Promise<Snapshot>; expiresAt: number };

const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 1500;

export async function loadAdminPlayersSnapshot(matchCode: string, force = false): Promise<Snapshot> {
    const key = matchCode;
    const existing = cache.get(key);
    if (!force && existing && existing.expiresAt > Date.now()) return existing.promise;

    const promise = Promise.all([
        fetch(`${API_BASE_URL}/matches/${encodeURIComponent(matchCode)}/players`, {
            credentials: "include",
        }),
        fetch(`${API_BASE_URL}/scoreboard/${encodeURIComponent(matchCode)}`, {
            credentials: "include",
        }),
    ]).then(async ([playersResponse, scoreboardResponse]) => {
        const playersJson = await playersResponse.json();
        const scoreboardJson = await scoreboardResponse.json();
        if (!playersResponse.ok) throw new Error(playersJson?.detail ?? "Failed to load players");
        if (!scoreboardResponse.ok) throw new Error(scoreboardJson?.detail ?? "Failed to load scoreboard");
        const snapshot = normalizePlayerSnapshot({
            players: playersJson?.data?.players,
            scoreboard: scoreboardJson?.data?.scoreboard,
        });
        const profiles = snapshot.players.map((entry) => ({
            user_code: entry.user_code,
            user_name: entry.user_name ?? "",
        }));
        return { ...snapshot, profiles };
    });

    cache.set(key, { promise, expiresAt: Date.now() + CACHE_TTL });
    try {
        return await promise;
    } catch (error) {
        cache.delete(key);
        throw error;
    }
}

export function invalidateAdminPlayersSnapshot(matchCode?: string): void {
    if (!matchCode) {
        cache.clear();
        return;
    }
    for (const key of cache.keys()) {
        if (key.startsWith(`${matchCode}:`)) cache.delete(key);
    }
}

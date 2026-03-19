import type { PlayerStatus } from "@/types/player";

interface RawPlayer {
  user_code?: string | number;
  user_name?: string;
  position?: number;
  cummulative_score?: number;
  cumulative_score?: number;
  total_score?: number;
  score?: number;
}
interface RawScore {
  user_code?: string | number;
  cummulative_score?: number;
  cumulative_score?: number;
  total_score?: number;
  score?: number;
  user_name?: string;
}
interface RawProfile {
  user_code?: string | number;
  user_name?: string;
}

export function buildPlayersSnapshot(
  playersList: RawPlayer[],
  scoreboard: RawScore[] = [],
  profiles: RawProfile[] = [],
  previousPlayers: PlayerStatus[] = [],
): PlayerStatus[] {
  if (!playersList?.length) return previousPlayers;

  const scoreMap = new Map(scoreboard.map((s) => [String(s.user_code ?? ""), s]));
  const profileMap = new Map(profiles.map((p) => [String(p.user_code ?? ""), p]));

  return playersList
    .map((entry) => {
      const code = String(entry?.user_code ?? "");
      if (!code) return null;

      const previous = previousPlayers.find((p) => p.playerCode === code);
      const profile = profileMap.get(code);
      const scoreInfo = scoreMap.get(code);

      // Prefer the correctly spelled 'cumulative_score' but accept the legacy 'cummulative_score' shape
      const playerScore = (scoreInfo && (scoreInfo.cumulative_score ?? scoreInfo.cummulative_score ?? scoreInfo.total_score ?? scoreInfo.score)) ?? previous?.playerScore ?? 0;

      return {
        playerCode: code,
        playerName: profile?.user_name ?? previous?.playerName ?? "",
        playerScore,
        playerLastAnswer: previous?.playerLastAnswer,
        playerTimestamp: previous?.playerTimestamp,
        playerHasBuzzed: previous?.playerHasBuzzed ?? false,
        playerConnected: previous?.playerConnected ?? false,
        // Support several possible flag names coming from server/admin snapshots
        playerIsTurn:
          (entry as any)?.is_current ?? (entry as any)?.isCurrent ?? (entry as any)?.is_selected ??
          (entry as any)?.selected ?? previous?.playerIsTurn ?? false,
      } as PlayerStatus;
    })
    .filter((p): p is PlayerStatus => p !== null);
}

export default buildPlayersSnapshot;

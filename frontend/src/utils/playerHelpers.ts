import type { PlayerStatus } from "@/types/player";

export function buildPlayersSnapshot(
  playersList: any[],
  scoreboard: any[] = [],
  profiles: any[] = [],
  previousPlayers: PlayerStatus[] = [],
): PlayerStatus[] {
  if (!playersList?.length) return previousPlayers;

  const scoreMap = new Map((scoreboard ?? []).map((s: any) => [String(s.user_code ?? ""), s]));
  const profileMap = new Map((profiles ?? []).map((p: any) => [String(p.user_code ?? ""), p]));

  return playersList
    .map((entry: any) => {
      const code = String(entry?.user_code ?? "");
      if (!code) return null;

      const previous = previousPlayers.find((p) => p.playerCode === code);
      const profile = profileMap.get(code);
      const scoreInfo = scoreMap.get(code);

      const playerScore = (scoreInfo && (scoreInfo.cummulative_score ?? scoreInfo.new_total_score)) ?? previous?.playerScore ?? 0;

      return {
        playerCode: code,
        playerName: profile?.user_name ?? previous?.playerName ?? "",
        playerScore,
        playerLastAnswer: previous?.playerLastAnswer,
        playerTimestamp: previous?.playerTimestamp,
        playerHasBuzzed: previous?.playerHasBuzzed ?? false,
      } as PlayerStatus;
    })
    .filter(Boolean) as PlayerStatus[];
}

export default buildPlayersSnapshot;

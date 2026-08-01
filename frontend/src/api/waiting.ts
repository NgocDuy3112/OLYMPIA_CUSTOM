import { requestJson } from "@/api/client";
import type { RawPlayer, RawProfile, RawScore } from "@/utils/playerHelpers";

interface ApiResponse<T> {
  status?: string;
  message?: string;
  detail?: string;
  data?: T;
}

interface MatchData {
  match_status?: string;
}

interface PlayersData {
  players?: RawPlayer[];
}

interface ScoreboardData {
  scoreboard?: RawScore[];
}

export interface WaitingSnapshot {
  matchFinished: boolean;
  players: RawPlayer[];
  scoreboard: RawScore[];
  profiles: RawProfile[];
}

export async function loadWaitingSnapshot(matchCode: string, token: string): Promise<WaitingSnapshot> {
  const encodedCode = encodeURIComponent(matchCode);
  const [matchResponse, playersResponse, scoreboardResponse] = await Promise.all([
    requestJson<ApiResponse<MatchData>>(`/matches/?match_code=${encodedCode}`, {}, token),
    requestJson<ApiResponse<PlayersData>>(`/matches/${encodedCode}/players`, {}, token),
    requestJson<ApiResponse<ScoreboardData>>(`/scoreboard/${encodedCode}`, {}, token),
  ]);
  const players = playersResponse.data?.players ?? [];
  return {
    matchFinished: matchResponse.data?.match_status === "finished",
    players,
    scoreboard: scoreboardResponse.data?.scoreboard ?? [],
    profiles: players.map((player) => ({
      user_code: player.user_code,
      user_name: player.user_name ?? "",
    })),
  };
}

export function buildWaitingBroadcastPlayers(snapshot: WaitingSnapshot): RawPlayer[] {
  const scores = new Map(snapshot.scoreboard.map((score) => [String(score.user_code ?? ""), score]));
  const profiles = new Map(snapshot.profiles.map((profile) => [String(profile.user_code ?? ""), profile]));
  return snapshot.players.map((player) => {
    const code = String(player.user_code ?? "");
    const score = scores.get(code);
    const profile = profiles.get(code);
    return {
      user_code: code,
      user_name: profile?.user_name ?? player.user_name ?? score?.user_name ?? "",
      position: player.position,
      cumulative_score: score?.cumulative_score ?? score?.total_score ?? score?.score ?? 0,
    };
  });
}

export async function finishMatch(matchCode: string, token: string): Promise<void> {
  await requestJson<ApiResponse<unknown>>(
    `/matches/${encodeURIComponent(matchCode)}/finish`,
    { method: "PATCH" },
    token,
  );
}

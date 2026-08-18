import type { PlayerStatus } from "@/types/player";
import { getScoreValue } from "@/utils/scoreHelpers";

export interface RawPlayer {
  user_code?: string | number;
  user_name?: string;
  cumulative_score?: number;
  total_score?: number;
  score?: number;
  position?: number;
  is_current?: boolean;
  isCurrent?: boolean;
  is_selected?: boolean;
  selected?: boolean;
}

export interface RawScore {
  user_code?: string | number;
  cumulative_score?: number;
  total_score?: number;
  score?: number;
  user_name?: string;
}

export interface RawProfile {
  user_code?: string | number;
  user_name?: string;
}

export interface PlayerSnapshotPayload {
  players?: unknown;
  scoreboard?: unknown;
  profiles?: unknown;
}

export function normalizePlayerSnapshot(payload: PlayerSnapshotPayload): {
  players: RawPlayer[];
  scoreboard: RawScore[];
  profiles: RawProfile[];
} {
  return {
    players: Array.isArray(payload.players)
      ? (payload.players as RawPlayer[])
      : [],
    scoreboard: Array.isArray(payload.scoreboard)
      ? (payload.scoreboard as RawScore[])
      : [],
    profiles: Array.isArray(payload.profiles)
      ? (payload.profiles as RawProfile[])
      : [],
  };
}

export function buildPlayersSnapshot(
  playersList: RawPlayer[],
  scoreboard: RawScore[] = [],
  profiles: RawProfile[] = [],
  previousPlayers: PlayerStatus[] = [],
): PlayerStatus[] {
  if (!playersList?.length) return previousPlayers;

  const scoreMap = new Map(
    scoreboard.map((s) => [String(s.user_code ?? ""), s]),
  );
  const profileMap = new Map(
    profiles.map((p) => [String(p.user_code ?? ""), p]),
  );

  return playersList
    .map((entry) => {
      const code = String(entry?.user_code ?? "");
      if (!code) return null;

      const previous = previousPlayers.find((p) => p.playerCode === code);
      const profile = profileMap.get(code);
      const scoreInfo = scoreMap.get(code);
      const playerScore =
        getScoreValue(scoreInfo) ??
        getScoreValue(entry) ??
        previous?.playerScore ??
        0;

      return {
        playerCode: code,
        playerName:
          profile?.user_name ?? entry.user_name ?? previous?.playerName ?? "",
        playerScore,
        playerLastAnswer: previous?.playerLastAnswer,
        playerTimestamp: previous?.playerTimestamp,
        playerHasBuzzed: previous?.playerHasBuzzed ?? false,
        playerConnected: previous?.playerConnected ?? false,
        playerIsTurn:
          entry.is_current ??
          entry.isCurrent ??
          entry.is_selected ??
          entry.selected ??
          previous?.playerIsTurn ??
          false,
      } as PlayerStatus;
    })
    .filter((p): p is PlayerStatus => p !== null);
}

export default buildPlayersSnapshot;

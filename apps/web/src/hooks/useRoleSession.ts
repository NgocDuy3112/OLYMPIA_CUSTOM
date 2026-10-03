import {
  getMatchCode,
  getMcCode,
  getPlayerCode,
  getUserCode,
} from "@/utils/storage";

interface SessionBase {
  matchCode: string;
}

interface PlayerSession extends SessionBase {
  playerCode: string;
}

interface McSession extends SessionBase {
  mcCode: string;
}

export function useRoleSession(role: "player"): PlayerSession;
export function useRoleSession(role: "mc"): McSession;
export function useRoleSession(
  role: "player" | "mc",
): PlayerSession | McSession {
  const matchCode = getMatchCode();
  if (role === "player") {
    return { matchCode, playerCode: getPlayerCode() || getUserCode() };
  }
  return { matchCode, mcCode: getMcCode() };
}

interface SessionBase {
  matchCode: string;
  token: string;
}

interface PlayerSession extends SessionBase {
  playerCode: string;
}

interface McSession extends SessionBase {
  mcCode: string;
}

export function useRoleSession(role: "player"): PlayerSession;
export function useRoleSession(role: "mc"): McSession;
export function useRoleSession(role: "player" | "mc"): PlayerSession | McSession {
  const matchCode = localStorage.getItem("matchCode") ?? "";
  const token = sessionStorage.getItem(`jwtToken_${role}`) ?? "";
  if (role === "player") {
    return { matchCode, token, playerCode: sessionStorage.getItem("playerCode") ?? "" };
  }
  return { matchCode, token, mcCode: sessionStorage.getItem("mcCode") ?? "" };
}

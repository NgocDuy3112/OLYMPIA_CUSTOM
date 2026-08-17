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
export function useRoleSession(role: "player" | "mc"): PlayerSession | McSession {
  const matchCode = localStorage.getItem("matchCode") ?? "";
  if (role === "player") {
    return { matchCode, playerCode: sessionStorage.getItem("playerCode") ?? "" };
  }
  return { matchCode, mcCode: sessionStorage.getItem("mcCode") ?? "" };
}

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

interface GuestSession extends SessionBase {
  guestCode: string;
}

export function useRoleSession(role: "player"): PlayerSession;
export function useRoleSession(role: "mc"): McSession;
export function useRoleSession(role: "guest"): GuestSession;
export function useRoleSession(role: "player" | "mc" | "guest"): PlayerSession | McSession | GuestSession {
  const matchCode = localStorage.getItem("matchCode") ?? "";
  const token = sessionStorage.getItem(`jwtToken_${role}`) ?? "";
  if (role === "player") {
    return { matchCode, token, playerCode: sessionStorage.getItem("playerCode") ?? "" };
  }
  if (role === "mc") {
    return { matchCode, token, mcCode: sessionStorage.getItem("mcCode") ?? "" };
  }
  return { matchCode, token, guestCode: sessionStorage.getItem("guestCode") ?? "" };
}

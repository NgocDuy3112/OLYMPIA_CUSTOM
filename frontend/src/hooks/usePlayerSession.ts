export interface PlayerSession {
    matchCode: string;
    playerCode: string;
    token: string;
}

export function usePlayerSession(): PlayerSession {
    // Read-only snapshot. If you need it to react to changes,
    // we can add storage event listeners later.
    const matchCode = sessionStorage.getItem("matchCode") ?? "";
    const playerCode = sessionStorage.getItem("playerCode") ?? "";
    const token = sessionStorage.getItem("jwtToken_player") ?? "";

    return { matchCode, playerCode, token };
}

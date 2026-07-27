export interface PlayerSession {
    matchCode: string;
    playerCode: string;
    token: string;
}

export function usePlayerSession(): PlayerSession {

    const matchCode = sessionStorage.getItem("matchCode") ?? "";
    const playerCode = sessionStorage.getItem("playerCode") ?? "";
    const token = sessionStorage.getItem("jwtToken_player") ?? "";

    return { matchCode, playerCode, token };
}

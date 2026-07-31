export interface GuestSession {
    matchCode: string;
    guestCode: string;
    token: string;
}

export function useGuestSession(): GuestSession {
    const matchCode = localStorage.getItem("matchCode") ?? "";
    const guestCode = sessionStorage.getItem("guestCode") ?? "";
    const token = sessionStorage.getItem("jwtToken_guest") ?? "";
    return { matchCode, guestCode, token };
}
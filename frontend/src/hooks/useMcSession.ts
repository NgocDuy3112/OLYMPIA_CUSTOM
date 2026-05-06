export interface McSession {
    matchCode: string;
    mcCode: string;
    token: string;
}

export function useMcSession(): McSession {
    const matchCode = sessionStorage.getItem("matchCode") ?? "";
    const mcCode = sessionStorage.getItem("mcCode") ?? "";
    const token = sessionStorage.getItem("jwtToken_mc") ?? "";
    return { matchCode, mcCode, token };
}

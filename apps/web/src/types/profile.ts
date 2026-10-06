export type PublicRole = "player" | "spectator";

export interface PublicProfile {
    userCode: string;
    userName: string;
    role: PublicRole;
    avatarUrl?: string | null;
    createdAt?: string;
}

export const PUBLIC_ROLE_LABEL: Record<PublicRole, string> = {
    player: "Thí sinh",
    spectator: "Khán giả"
};

export function isPublicRole(value: unknown): value is PublicRole {
    return value === "player" || value === "spectator";
}

export function isPublicProfile(value: unknown): value is PublicProfile {
    if (typeof value !== "object" || value === null) return false;
    const candidate = value as Record<string, unknown>;
    return (
        typeof candidate.userCode === "string" &&
        candidate.userCode.length > 0 &&
        typeof candidate.userName === "string" &&
        candidate.userName.length > 0 &&
        isPublicRole(candidate.role)
    );
}
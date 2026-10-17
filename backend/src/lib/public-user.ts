import type { users } from "../db/schema/index.js";

type UserRow = typeof users.$inferSelect;

export interface PublicUser {
    id: string;
    username: string | null;
    displayName: string;
    role: "ADMIN" | "OPERATOR" | "PLAYER";
    emailVerified: boolean;
    totpEnabled: boolean;
    avatarUrl: string | null;
}

export function toPublicUser(user: UserRow): PublicUser {
    return {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role as PublicUser["role"],
        emailVerified: user.emailVerified,
        totpEnabled: user.totpEnabledAt !== null,
        avatarUrl: user.avatarUrl
    };
}
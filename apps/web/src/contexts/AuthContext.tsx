import { createContext } from "react";


export type GlobalRole = "admin" | "operator" | "player" | "spectator";

export type OperatorScope = "qauthor" | "controller" | "mc";

export interface AuthUser {
    userId: string;
    userCode: string;
    userName: string;
    role: GlobalRole;
    operatorScopes?: OperatorScope[] | null;
    email?: string | null;
}

export interface AuthContextValue {
    user: AuthUser | null;
    isLoading: boolean;
    isAuthenticated: boolean;
    error: string | null;
    refresh: () => Promise<AuthUser | null>;
    logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
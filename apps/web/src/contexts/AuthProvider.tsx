import { useCallback, useMemo, useEffect, useState, type ReactNode } from "react";
import { ApiError, apiGet, apiSend } from "@/api/client";
import { clearAuthSession } from "@/utils/storage";
import { AuthContext, type AuthContextValue, type AuthUser } from "./AuthContext";


export function AuthProvider({children}: {children: ReactNode}) {
    const [user, setUser] = useState<AuthUser | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async(): Promise<AuthUser | null> => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await apiGet<AuthUser>("/auth/me");
            const userData = response.data ?? null;
            setUser(userData);
            return userData;
        } catch (err) {
            if (!(err instanceof ApiError)) {
                setError(err instanceof Error ? err.message : "Authentication check failed!");
            }
            setUser(null);
            return null;
        } finally {
            setIsLoading(false);
        }
    }, []);

    const logout = useCallback(async() => {
        try {
            await apiSend<unknown>("POST", "/auth/logout");
        } catch (err) {
            if (!(err instanceof ApiError)) throw err;
        } finally {
            setUser(null);
            clearAuthSession();
        }
    }, []);

    useEffect(() => {void refresh()}, [refresh]);

    const value = useMemo<AuthContextValue>(
        () => ({
            user,
            isLoading,
            isAuthenticated: !!user,
            error,
            refresh,
            logout
        }),
        [user, isLoading, error, refresh, logout]
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
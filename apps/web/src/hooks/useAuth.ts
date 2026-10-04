import { useState, useEffect, useCallback } from "react";
import { apiGet, apiSend, ApiError } from "@/api/client";
import { clearAuthSession } from "@/utils/storage";

export type GlobalRole = "admin" | "operator" | "player" | "spectator";

export type OperatorScope = "qauthor" | "controller" | "mc";

export interface AuthUser {
  userId: string;
  userCode: string;
  role: GlobalRole;
  operatorScopes?: string | null;
  email: string;
  userName: string;
}

interface UseAuthReturn {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

export function useAuth(): UseAuthReturn {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchUser = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const data = await apiGet<AuthUser>(`/auth/me`);
      setUser(data.data ?? null);
    } catch (err) {
      // HTTP/envelope lỗi: chỉ setUser(null) như trước, không ghi error.
      if (!(err instanceof ApiError))
        setError(err instanceof Error ? err.message : "Auth check failed");
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiSend<unknown>("POST", "/auth/logout");
    } catch (err) {
      // HTTP lỗi: bỏ qua như trước (lỗi mạng vẫn reject).
      if (!(err instanceof ApiError)) throw err;
    } finally {
      setUser(null);
      clearAuthSession();
    }
  }, []);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    error,
    refresh: fetchUser,
    logout,
  };
}

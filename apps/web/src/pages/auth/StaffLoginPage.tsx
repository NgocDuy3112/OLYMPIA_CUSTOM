import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { BaseAuthLayout } from "@/pages/auth/BaseAuthLayout";
import { API_BASE_URL } from "@/configs";

type StaffMode = "admin" | "operator";

const MODE_COPY: Record<StaffMode, { subtitle: string; button: string; placeholder: string }> = {
  admin: {
    subtitle: "Quản trị hệ thống",
    button: "Đăng nhập admin",
    placeholder: "Username admin",
  },
  operator: {
    subtitle: "Điều phối — Controller / QAuthor / MC",
    button: "Đăng nhập operator",
    placeholder: "Username, mã OC_U_xxx hoặc email",
  },
};

const OPERATOR_HOME: { scope: string; path: string }[] = [
  { scope: "controller", path: "/operator/controller/overview" },
  { scope: "qauthor", path: "/operator/qauthor/bank" },
  { scope: "mc", path: "/operator/mc/access" },
];

const StaffLoginPage: React.FC<{ mode: StaffMode }> = ({ mode }) => {
    const navigate = useNavigate();
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const copy = MODE_COPY[mode];

    const handleStaffLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);
        try {
            const res = await fetch(`${API_BASE_URL}/auth/staff-login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ username, password, expectRole: mode }),
            });
            const json = await res.json();
            if (!res.ok || json.status !== "success") {
                throw new Error(json.message ?? "Đăng nhập thất bại");
            }
            if (mode === "admin") {
                navigate("/admin");
                return;
            }
            const scopes = String(json.data?.operatorScopes ?? "")
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean);
            const home =
                OPERATOR_HOME.find((h) => scopes.includes(h.scope))?.path ??
                "/operator/controller/overview";
            navigate(home);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Đăng nhập thất bại");
        } finally {
            setLoading(false);
        }
    };

    return (
        <BaseAuthLayout title="OLYMPIA CUSTOM" subtitle={copy.subtitle}>
            <div className="flex flex-col gap-4 items-center">
                <form onSubmit={(e) => void handleStaffLogin(e)} className="flex flex-col gap-3 w-full">
                    <input
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder={copy.placeholder}
                        required
                        className="px-4 py-2.5 rounded-lg bg-white/10 border border-gray-600 text-white placeholder-gray-400 text-sm"
                    />
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Mật khẩu"
                        required
                        minLength={8}
                        className="px-4 py-2.5 rounded-lg bg-white/10 border border-gray-600 text-white placeholder-gray-400 text-sm"
                    />
                    {error && <p className="text-xs text-red-400">{error}</p>}
                    <button
                        type="submit"
                        disabled={loading}
                        className="px-4 py-2.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
                    >
                        {loading ? "Đang đăng nhập..." : copy.button}
                    </button>
                </form>
            </div>
        </BaseAuthLayout>
    );
};

export default StaffLoginPage;

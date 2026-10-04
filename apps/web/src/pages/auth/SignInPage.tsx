import { useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { BaseAuthLayout } from "@/pages/auth/BaseAuthLayout";
import { apiCall } from "@/api/client";
import { API_BASE_URL } from "@/configs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { authInputClass, AuthError } from "@/components/auth/AuthFormBits";

type StaffRole = "admin" | "operator";

const STAFF_COPY: Record<
  StaffRole,
  { subtitle: string; button: string; placeholder: string }
> = {
  admin: {
    subtitle: "Quản trị hệ thống",
    button: "Đăng nhập admin",
    placeholder: "Username",
  },
  operator: {
    subtitle: "Điều phối — Controller / QAuthor / MC",
    button: "Đăng nhập operator",
    placeholder: "Username",
  },
};

const OPERATOR_HOME: { scope: string; path: string }[] = [
  { scope: "controller", path: "/operator/controller/overview" },
  { scope: "qauthor", path: "/operator/qauthor/bank" },
  { scope: "mc", path: "/operator/mc/access" },
];

const GoogleIcon = () => (
  <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden>
    <path
      fill="#4285F4"
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
    />
    <path
      fill="#34A853"
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
    />
    <path
      fill="#FBBC05"
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
    />
    <path
      fill="#EA4335"
      d="M12 5.38c1.62 0 3.06.62 4.21 1.84l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
    />
  </svg>
);

const Divider: React.FC<{ label: string }> = ({ label }) => (
  <div className="flex items-center gap-3 text-xs text-muted-foreground">
    <span className="h-px flex-1 bg-border" aria-hidden />
    {label}
    <span className="h-px flex-1 bg-border" aria-hidden />
  </div>
);


const SignInPage = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const roleParam = params.get("role");

  const [method, setMethod] = useState<"player" | "staff">(
    roleParam === "admin" || roleParam === "operator" ? "staff" : "player",
  );
  const [staffRole, setStaffRole] = useState<StaffRole>(
    roleParam === "operator" ? "operator" : "admin",
  );

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [staffPassword, setStaffPassword] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const googleLogin = () => {
    window.location.href = `${API_BASE_URL}/auth/google`;
  };

  const submitPlayer = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await apiCall("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      navigate("/profile");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Đăng nhập thất bại");
    } finally {
      setLoading(false);
    }
  };

  const submitStaff = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const payload = {
        username,
        password: staffPassword,
        expectRole: staffRole,
      };
      const json = await apiCall<{ operatorScopes?: string }>("/auth/staff-login", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      if (staffRole === "admin") {
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
    <BaseAuthLayout
      title="OLYMPIA CUSTOM"
      subtitle={
        method === "staff"
          ? STAFF_COPY[staffRole].subtitle
          : "Đăng nhập"
      }
    >
      <div className="flex w-full flex-col gap-4">
        <Tabs
          value={method}
          onValueChange={(v) => {
            setMethod(v as "player" | "staff");
            setError(null);
          }}
          className="w-full"
        >
          <TabsList className="grid h-11 w-full grid-cols-2">
            <TabsTrigger value="player" className="text-sm">
              Thí sinh
            </TabsTrigger>
            <TabsTrigger value="staff" className="text-sm">
              Nhân sự
            </TabsTrigger>
          </TabsList>

          <TabsContent value="player" className="mt-4 flex flex-col gap-3">
            
            <form
              onSubmit={(e) => void submitPlayer(e)}
              className="flex flex-col gap-3"
            >
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                aria-label="Email"
                required
                className={authInputClass}
              />
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mật khẩu"
                aria-label="Mật khẩu"
                required
                minLength={8}
                className={authInputClass}
              />
              <Button
                type="submit"
                disabled={loading}
                className="h-11 w-full text-sm font-medium disabled:opacity-50"
              >
                {loading ? "Đang đăng nhập..." : "Đăng nhập"}
              </Button>
            </form>
            
            <Divider label="hoặc" />
            <Button
              type="button"
              variant="outline"
              onClick={googleLogin}
              className="h-11 w-full gap-3 bg-white font-semibold text-background hover:bg-white/90"
            >
              <GoogleIcon />
              Đăng nhập với Google
            </Button>
            
          </TabsContent>

          {}
          <TabsContent value="staff" className="mt-4 flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-2">
              {(["admin", "operator"] as StaffRole[]).map((r) => (
                <Button
                  key={r}
                  type="button"
                  variant={staffRole === r ? "default" : "outline"}
                  aria-pressed={staffRole === r}
                  onClick={() => {
                    setStaffRole(r);
                    setError(null);
                  }}
                  className="h-10 text-sm"
                >
                  {r === "admin" ? "Quản trị" : "Điều phối"}
                </Button>
              ))}
            </div>
            <form
              onSubmit={(e) => void submitStaff(e)}
              className="flex flex-col gap-3"
            >
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={STAFF_COPY[staffRole].placeholder}
                aria-label="Tên đăng nhập nhân sự"
                required
                autoComplete="username"
                className={authInputClass}
              />
              <Input
                type="password"
                value={staffPassword}
                onChange={(e) => setStaffPassword(e.target.value)}
                placeholder="Mật khẩu"
                aria-label="Mật khẩu"
                required
                minLength={8}
                autoComplete="current-password"
                className={authInputClass}
              />
              <Button
                type="submit"
                disabled={loading}
                className="h-11 w-full text-sm font-medium disabled:opacity-50"
              >
                {loading ? "Đang đăng nhập..." : STAFF_COPY[staffRole].button}
              </Button>
            </form>
            <p className="text-xs text-muted-foreground">
              
            </p>
          </TabsContent>
        </Tabs>

        {error && <AuthError message={error} />}

        <Divider label="hoặc" />

        <a
          href="/spectator"
          className="flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-border text-sm font-medium text-foreground/80 transition-all duration-200 hover:bg-accent hover:text-foreground"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
            />
          </svg>
          Tham gia với vai trò khách
        </a>
      </div>
    </BaseAuthLayout>
  );
};

export default SignInPage;

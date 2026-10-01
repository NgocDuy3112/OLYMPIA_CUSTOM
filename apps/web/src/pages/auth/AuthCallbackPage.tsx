import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { API_BASE_URL } from "@/configs";
import { setUserCode, setUserName, setUserRole } from "@/utils/storage";
import { Button } from "@/components/ui/button";

type AuthState = "loading" | "success" | "error";

const AuthCallbackPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [state, setState] = useState<AuthState>("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const sid = searchParams.get("sid");

    if (!sid) {
      setState("error");
      setError("No session ID received");
      return;
    }

    // Verify session with backend
    const verifySession = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/auth/me`, {
          credentials: "include",
        });

        if (!response.ok) {
          throw new Error("Session verification failed");
        }

        const data = await response.json();
        if (data.status === "success" && data.data) {
          // Store minimal user info in sessionStorage for quick access
          // (actual auth is cookie-based)
          setUserRole(data.data.role);
          setUserCode(data.data.userCode);
          setUserName(data.data.userName);

          setState("success");

          // Redirect based on role
          setTimeout(() => {
            const role = data.data.role;
            if (role === "admin") {
              navigate("/admin");
            } else if (role === "mc") {
              navigate("/operator/mc");
            } else {
              navigate("/player");
            }
          }, 500);
        } else {
          throw new Error("Invalid session data");
        }
      } catch (err) {
        setState("error");
        setError(err instanceof Error ? err.message : "Authentication failed");
      }
    };

    // Small delay to ensure cookie is set
    const timer = setTimeout(verifySession, 100);
    return () => clearTimeout(timer);
  }, [searchParams, navigate]);

  if (state === "loading") {
    return (
      <div className="flex flex-col justify-center items-center min-h-screen p-4">
        <div className="card text-center w-full max-w-sm">
          <div className="animate-spin w-10 h-10 sm:w-12 sm:h-12 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-base sm:text-lg font-semibold">Đang xác thực...</p>
        </div>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="flex flex-col justify-center items-center min-h-screen p-4">
        <div className="card text-center w-full max-w-sm">
          <p className="text-lg sm:text-xl font-bold text-destructive mb-2">
            Đăng nhập thất bại
          </p>
          <p className="text-muted-foreground text-sm mb-4">{error}</p>
          <Button
            variant="default"
            onClick={() => navigate("/login")}
            className="bg-primary text-foreground hover:bg-primary/70 touch-target"
          >
            Thử lại
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col justify-center items-center min-h-screen p-4">
      <div className="card text-center w-full max-w-sm">
        <div className="text-success text-4xl sm:text-5xl mb-4">✓</div>
        <p className="text-base sm:text-lg font-semibold">
          Đăng nhập thành công!
        </p>
        <p className="text-muted-foreground text-sm">Đang chuyển trang...</p>
      </div>
    </div>
  );
};

export default AuthCallbackPage;

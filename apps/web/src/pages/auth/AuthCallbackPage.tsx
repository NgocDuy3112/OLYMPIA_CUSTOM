import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { API_BASE_URL } from "@/configs";

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
          sessionStorage.setItem("user_role", data.data.role);
          sessionStorage.setItem("user_code", data.data.userCode);
          sessionStorage.setItem("user_name", data.data.userName);

          setState("success");

          // Redirect based on role
          setTimeout(() => {
            const role = data.data.role;
            if (role === "admin") {
              navigate("/admin");
            } else if (role === "mc") {
              navigate("/mc");
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
          <div className="animate-spin w-10 h-10 sm:w-12 sm:h-12 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-base sm:text-lg font-semibold">Đang xác thực...</p>
        </div>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="flex flex-col justify-center items-center min-h-screen p-4">
        <div className="card text-center w-full max-w-sm">
          <p className="text-lg sm:text-xl font-bold text-red-500 mb-2">Đăng nhập thất bại</p>
          <p className="text-gray-400 text-sm mb-4">{error}</p>
          <button
            onClick={() => navigate("/login")}
            className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 touch-target"
          >
            Thử lại
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col justify-center items-center min-h-screen p-4">
      <div className="card text-center w-full max-w-sm">
        <div className="text-green-500 text-4xl sm:text-5xl mb-4">✓</div>
        <p className="text-base sm:text-lg font-semibold">Đăng nhập thành công!</p>
        <p className="text-gray-400 text-sm">Đang chuyển trang...</p>
      </div>
    </div>
  );
};

export default AuthCallbackPage;

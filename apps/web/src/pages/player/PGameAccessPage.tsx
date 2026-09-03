import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE_URL } from "@/configs";
import { ArrowLeft, LogOut } from "lucide-react";

const PIN_LENGTH = 6;

const PGameAccessPage: React.FC = () => {
  const navigate = useNavigate();
  const [pin, setPin] = useState<string[]>(Array(PIN_LENGTH).fill(""));
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Focus first input on mount
  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  const handleChange = (index: number, value: string) => {
    // Only allow digits
    if (value && !/^\d+$/.test(value)) return;

    const newPin = [...pin];
    // Handle paste (multiple characters)
    if (value.length > 1) {
      const digits = value.slice(0, PIN_LENGTH - index).split("");
      digits.forEach((digit, i) => {
        if (index + i < PIN_LENGTH) {
          newPin[index + i] = digit;
        }
      });
      setPin(newPin);

      // Focus next empty input or last input
      const nextIndex = Math.min(index + digits.length, PIN_LENGTH - 1);
      inputRefs.current[nextIndex]?.focus();

      // Auto-submit if all filled
      if (newPin.every((d) => d !== "")) {
        handleSubmit(newPin.join(""));
      }
    } else {
      newPin[index] = value;
      setPin(newPin);

      // Auto-advance to next input
      if (value && index < PIN_LENGTH - 1) {
        inputRefs.current[index + 1]?.focus();
      }

      // Auto-submit if all filled
      if (newPin.every((d) => d !== "") && value) {
        handleSubmit(newPin.join(""));
      }
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !pin[index] && index > 0) {
      // Move to previous input on backspace
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData("text").replace(/\D/g, "");
    if (pastedData) {
      handleChange(0, pastedData);
    }
  };

  const handleSubmit = async (pinString?: string) => {
    const pinCode = pinString || pin.join("");
    if (pinCode.length !== PIN_LENGTH) {
      setError("Vui lòng nhập đủ 6 chữ số");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/matches/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ pin: pinCode }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Invalid PIN");
      }

      if (data.status === "success" && data.data) {
        // Store match info and redirect to game
        localStorage.setItem("matchCode", data.data.matchSlug);
        sessionStorage.setItem("playerCode", data.data.matchSlug);
        navigate(`/player/waiting/${data.data.matchSlug}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to join match");
      // Clear PIN on error
      setPin(Array(PIN_LENGTH).fill(""));
      inputRefs.current[0]?.focus();
    } finally {
      setIsLoading(false);
    }
  };

  const handleClear = () => {
    setPin(Array(PIN_LENGTH).fill(""));
    setError(null);
    inputRefs.current[0]?.focus();
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-black/30 backdrop-blur-sm border-b border-white/10">
        <div className="flex items-center justify-between px-4 py-3">
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
          >
            <ArrowLeft size={18} />
            <span className="text-sm">Quay lại</span>
          </button>
          <span className="text-sm font-bold text-white">OLYMPIA CUSTOM</span>
          <div className="w-20" /> {/* Spacer for centering */}
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          {/* Title */}
          <div className="text-center mb-8">
            <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">
              Vào Phòng Thi
            </h1>
            <p className="text-gray-400 text-sm">
              Nhập mã PIN 6 chữ số từ MC hoặc admin
            </p>
          </div>

          {/* PIN Input */}
          <div className="card !p-6">
            <div className="flex justify-center gap-2 sm:gap-3 mb-6">
              {pin.map((digit, index) => (
                <input
                  key={index}
                  ref={(el) => {
                    inputRefs.current[index] = el;
                  }}
                  type="text"
                  inputMode="numeric"
                  maxLength={PIN_LENGTH}
                  value={digit}
                  onChange={(e) => handleChange(index, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(index, e)}
                  onPaste={handlePaste}
                  disabled={isLoading}
                  className={`
                    w-12 h-14 sm:w-14 sm:h-16 text-center text-2xl font-bold
                    bg-white/10 border-2 rounded-lg
                    focus:outline-none focus:border-blue-500
                    disabled:opacity-50
                    ${error ? "border-red-500" : "border-white/20"}
                    ${digit ? "text-white" : "text-gray-500"}
                  `}
                />
              ))}
            </div>

            {/* Error message */}
            {error && (
              <div className="mb-4 p-3 bg-red-500/20 border border-red-500 rounded-lg text-red-400 text-sm text-center">
                {error}
              </div>
            )}

            {/* Buttons */}
            <div className="flex gap-3">
              <button
                onClick={handleClear}
                disabled={isLoading || pin.every((d) => d === "")}
                className="flex-1 px-4 py-3 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                Xóa
              </button>
              <button
                onClick={() => handleSubmit()}
                disabled={isLoading || pin.some((d) => d === "")}
                className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                {isLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                    Đang kiểm tra...
                  </span>
                ) : (
                  "Vào phòng"
                )}
              </button>
            </div>
          </div>

          {/* Help text */}
          <div className="mt-6 text-center text-xs text-gray-500">
            <p>
              Nếu bạn không có mã PIN, liên hệ MC hoặc admin để được cung cấp.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
};

export default PGameAccessPage;

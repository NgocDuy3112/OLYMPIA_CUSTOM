import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE_URL } from "@/configs";
import { setMatchCode, setPlayerCode } from "@/utils/storage";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const PIN_LENGTH = 6;

const PGameAccessPage: React.FC = () => {
  const navigate = useNavigate();
  const [pin, setPin] = useState<string[]>(Array(PIN_LENGTH).fill(""));
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  const handleChange = (index: number, value: string) => {
    if (value && !/^\d+$/.test(value)) return;

    const newPin = [...pin];
    if (value.length > 1) {
      const digits = value.slice(0, PIN_LENGTH - index).split("");
      digits.forEach((digit, i) => {
        if (index + i < PIN_LENGTH) {
          newPin[index + i] = digit;
        }
      });
      setPin(newPin);

      const nextIndex = Math.min(index + digits.length, PIN_LENGTH - 1);
      inputRefs.current[nextIndex]?.focus();

      if (newPin.every((d) => d !== "")) {
        handleSubmit(newPin.join(""));
      }
    } else {
      newPin[index] = value;
      setPin(newPin);

      if (value && index < PIN_LENGTH - 1) {
        inputRefs.current[index + 1]?.focus();
      }

      if (newPin.every((d) => d !== "") && value) {
        handleSubmit(newPin.join(""));
      }
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !pin[index] && index > 0) {
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
        setMatchCode(data.data.matchSlug);
        try {
          const me = await fetch(`${API_BASE_URL}/auth/me`, {
            credentials: "include",
          }).then((r) => r.json());
          const userCode = me?.data?.userCode as string | undefined;
          if (userCode) setPlayerCode(userCode);
        } catch {
        }
        navigate(`/player/waiting/${data.data.matchSlug}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to join match");
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
      {}
      <header className="sticky top-0 z-40 bg-background/30 backdrop-blur-sm border-b border-border">
        <div className="flex items-center justify-between px-4 py-3">
          <Button
            variant="ghost"
            onClick={() => navigate("/")}
            className="gap-2 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft size={18} />
            <span className="text-sm">Quay lại</span>
          </Button>
          <span className="text-sm font-bold text-foreground">OLYMPIA CUSTOM</span>
          <div className="w-20" /> {}
        </div>
      </header>

      {}
      <main className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          {}
          <div className="text-center mb-8">
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-2">
              Vào Phòng Thi
            </h1>
            <p className="text-muted-foreground text-sm">
              Nhập mã PIN 6 chữ số từ MC hoặc admin
            </p>
          </div>

          {}
          <div className="card !p-6">
            <div className="flex justify-center gap-2 sm:gap-3 mb-6">
              {pin.map((digit, index) => (
                <Input
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
                    h-14 w-12 sm:h-16 sm:w-14 text-center text-2xl font-bold
                    bg-accent border-2 rounded-lg
                    focus:outline-none focus:border-ring
                    disabled:opacity-50
                    ${error ? "border-destructive" : "border-border"}
                    ${digit ? "text-foreground" : "text-muted-foreground"}
                  `}
                />
              ))}
            </div>

            {}
            {error && (
              <div className="mb-4 p-3 bg-destructive/20 border border-destructive rounded-lg text-destructive text-sm text-center">
                {error}
              </div>
            )}

            {}
            <div className="flex gap-3">
              <Button
                variant="secondary"
                onClick={handleClear}
                disabled={isLoading || pin.every((d) => d === "")}
                className="flex-1 bg-accent hover:bg-accent text-foreground"
              >
                Xóa
              </Button>
              <Button
                variant="default"
                onClick={() => handleSubmit()}
                disabled={isLoading || pin.some((d) => d === "")}
                className="flex-1 text-foreground"
              >
                {isLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                    Đang kiểm tra...
                  </span>
                ) : (
                  "Vào phòng"
                )}
              </Button>
            </div>
          </div>

          {}
          <div className="mt-6 text-center text-xs text-muted-foreground">
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

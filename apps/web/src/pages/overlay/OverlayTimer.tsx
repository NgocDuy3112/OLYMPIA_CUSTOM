import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useWebSocket } from "@/hooks/useWebSocket";

const OverlayTimer: React.FC = () => {
  const { matchCode } = useParams<{ matchCode: string }>();
  const { lastMessage } = useWebSocket(matchCode || "");
  const [timer, setTimer] = useState<number | null>(null);

  useEffect(() => {
    if (!lastMessage) return;

    const msg = lastMessage.message ?? lastMessage;

    if (msg?.type === "start_the_timer") {
      const timeLimit =
        typeof msg.time_limit === "number" ? msg.time_limit : 30;
      setTimer(timeLimit);
    } else if (msg?.type === "timer_update") {
      const countdown =
        typeof msg.countdown === "number" ? msg.countdown : null;
      setTimer(countdown);
    } else if (msg?.type === "clear_question") {
      setTimer(null);
    }
  }, [lastMessage]);

  if (timer === null) {
    return null; // Transparent when no timer
  }

  // Color based on time remaining
  const getColor = (t: number) => {
    if (t <= 5) return "text-red-500";
    if (t <= 10) return "text-yellow-500";
    return "text-white";
  };

  return (
    <div className="bg-transparent p-2 sm:p-4 flex items-center justify-center min-w-[80px] sm:min-w-[120px] min-h-[80px] sm:min-h-[120px]">
      <style>{`
        body { background: transparent !important; }
        #root { background: transparent !important; }
      `}</style>

      <div
        className={`text-4xl sm:text-5xl md:text-6xl font-bold font-mono tabular-nums ${getColor(timer)}`}
        style={{
          textShadow: "3px 3px 6px rgba(0,0,0,0.9)",
        }}
      >
        {timer}
      </div>
    </div>
  );
};

export default OverlayTimer;

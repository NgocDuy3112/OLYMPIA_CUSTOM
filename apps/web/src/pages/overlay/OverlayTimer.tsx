import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useWebSocket } from "@/hooks/useWebSocket";
import { motion, AnimatePresence } from "framer-motion";

const OverlayTimer: React.FC = () => {
  const { matchCode } = useParams<{ matchCode: string }>();
  const { lastMessage } = useWebSocket(matchCode || "");
  const [timer, setTimer] = useState<number | null>(null);
  const [timeLimit, setTimeLimit] = useState<number>(30);

  useEffect(() => {
    if (!lastMessage) return;

    const msg = lastMessage.message ?? lastMessage;

    if (msg?.type === "start_the_timer") {
      const limit = typeof msg.time_limit === "number" ? msg.time_limit : 30;
      setTimeLimit(limit);
      setTimer(limit);
    } else if (msg?.type === "timer_update") {
      const countdown = typeof msg.countdown === "number" ? msg.countdown : null;
      setTimer(countdown);
    } else if (msg?.type === "clear_question" || msg?.type === "round_end") {
      setTimer(null);
    }
  }, [lastMessage]);

  if (timer === null) {
    return null;
  }

  // Calculate progress percentage
  const progress = (timer / timeLimit) * 100;

  // Get color based on time remaining
  const getColor = (t: number) => {
    if (t <= 5) return { text: "text-red-400", ring: "stroke-red-500", bg: "bg-red-500/20" };
    if (t <= 10) return { text: "text-yellow-400", ring: "stroke-yellow-500", bg: "bg-yellow-500/20" };
    return { text: "text-white", ring: "stroke-blue-500", bg: "bg-blue-500/20" };
  };

  const colors = getColor(timer);

  return (
    <div className="bg-transparent p-2 sm:p-4 flex items-center justify-center min-w-[100px] sm:min-w-[140px] min-h-[100px] sm:min-h-[140px]">
      <style>{`
        body { background: transparent !important; }
        #root { background: transparent !important; }
      `}</style>

      <div className="relative">
        {/* Background circle */}
        <div className={`
          w-24 h-24 sm:w-28 sm:h-28 rounded-full backdrop-blur-md
          ${colors.bg} border border-white/10 shadow-xl
          flex items-center justify-center
        `}>
          {/* Timer text */}
          <AnimatePresence mode="wait">
            <motion.div
              key={timer}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 1.1, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className={`text-3xl sm:text-4xl font-bold font-mono tabular-nums ${colors.text}`}
            >
              {timer}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Progress ring */}
        <svg
          className="absolute inset-0 w-full h-full -rotate-90"
          viewBox="0 0 100 100"
        >
          {/* Background ring */}
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            stroke="rgba(255,255,255,0.1)"
            strokeWidth="4"
          />
          {/* Progress ring */}
          <motion.circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            className={colors.ring}
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={`${2 * Math.PI * 45}`}
            initial={{ strokeDashoffset: 0 }}
            animate={{
              strokeDashoffset: 2 * Math.PI * 45 * (1 - progress / 100),
            }}
            transition={{ duration: 0.3 }}
          />
        </svg>

        {/* Pulse effect when low time */}
        {timer <= 5 && (
          <motion.div
            className={`absolute inset-0 rounded-full ${colors.bg}`}
            animate={{
              scale: [1, 1.1, 1],
              opacity: [0.5, 0, 0.5],
            }}
            transition={{
              duration: 1,
              repeat: Infinity,
            }}
          />
        )}
      </div>
    </div>
  );
};

export default OverlayTimer;

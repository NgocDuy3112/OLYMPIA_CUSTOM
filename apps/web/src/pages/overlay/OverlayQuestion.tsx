import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useWebSocket } from "@/hooks/useWebSocket";
import { motion, AnimatePresence } from "framer-motion";
import { useOverlayMode } from "@/hooks/useOverlayMode";

interface QuestionData {
  content?: string;
  media?: string;
  category?: string;
  points?: number;
}

const OverlayQuestion: React.FC = () => {
  useOverlayMode();
  const { matchCode } = useParams<{ matchCode: string }>();
  const { lastMessage } = useWebSocket(matchCode || "");
  const [question, setQuestion] = useState<QuestionData | null>(null);

  useEffect(() => {
    if (!lastMessage) return;

    const msg = lastMessage.message ?? lastMessage;

    if (msg?.type === "send_question") {
      setQuestion({
        content: msg.content || msg.question_text || "",
        media: typeof msg.media === "string" ? msg.media : undefined,
        category: msg.category || undefined,
        points: typeof msg.points === "number" ? msg.points : undefined,
      });
    } else if (msg?.type === "clear_question") {
      setQuestion(null);
    }
  }, [lastMessage]);

  if (!question?.content) {
    return null;
  }

  return (
    <div className="bg-transparent p-4 sm:p-6 min-w-[320px] sm:min-w-[500px] max-w-[700px]">

      <AnimatePresence mode="wait">
        <motion.div
          key={question.content}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.3 }}
          className="backdrop-blur-md bg-background/40 rounded-2xl border border-border p-5 sm:p-6 shadow-2xl"
        >
          {}
          {(question.category || question.points) && (
            <div className="flex items-center gap-2 mb-3">
              {question.category && (
                <span className="px-3 py-1 bg-primary/20 text-brand text-xs font-semibold rounded-full border border-primary/30">
                  {question.category}
                </span>
              )}
              {question.points && (
                <span className="px-3 py-1 bg-success/20 text-success text-xs font-semibold rounded-full border border-success/30">
                  {question.points} điểm
                </span>
              )}
            </div>
          )}

          {}
          <div className="text-xl sm:text-2xl md:text-3xl font-semibold text-foreground leading-relaxed">
            {question.content}
          </div>

          {}
          {question.media && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mt-4 flex items-center gap-2 text-sm text-foreground/50"
            >
              <div className="w-2 h-2 bg-foreground/30 rounded-full animate-pulse" />
              <span>Đang hiển thị media</span>
            </motion.div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

export default OverlayQuestion;

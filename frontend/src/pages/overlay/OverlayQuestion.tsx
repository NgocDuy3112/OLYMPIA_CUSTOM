import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useWebSocket } from "@/hooks/useWebSocket";

interface QuestionData {
  content?: string;
  media?: string;
}

const OverlayQuestion: React.FC = () => {
  const { matchCode } = useParams<{ matchCode: string }>();
  const { lastMessage } = useWebSocket(matchCode || "");
  const [question, setQuestion] = useState<QuestionData | null>(null);

  useEffect(() => {
    if (!lastMessage) return;

    const msg = lastMessage.message ?? lastMessage;

    if (msg?.type === "send_question") {
      setQuestion({
        content: msg.content || "",
        media: typeof msg.media === "string" ? msg.media : undefined,
      });
    } else if (msg?.type === "clear_question") {
      setQuestion(null);
    }
  }, [lastMessage]);

  if (!question?.content) {
    return null; // Transparent when no question
  }

  return (
    <div className="bg-transparent p-3 sm:p-6 min-w-[280px] sm:min-w-[400px] max-w-[600px]">
      <style>{`
        body { background: transparent !important; }
        #root { background: transparent !important; }
      `}</style>

      <div
        className="text-xl sm:text-2xl md:text-3xl font-bold text-white leading-relaxed"
        style={{
          textShadow: "3px 3px 6px rgba(0,0,0,0.9)",
        }}
      >
        {question.content}
      </div>

      {/* Media hint */}
      {question.media && (
        <div className="mt-4 text-sm text-white/60 italic">
          [Đang hiển thị media]
        </div>
      )}
    </div>
  );
};

export default OverlayQuestion;

import { useCallback, useState } from "react";
import { apiSend, ApiError } from "@/api/client";
import { createLogger } from "@/utils/logger";

const logger = createLogger("useOceeReview");

export interface OceeQuestion {
  content: string;
  answer: string;
  context?: string;
}

export function useOceeReview() {
  const [asking, setAsking] = useState(false);
  const [opinion, setOpinion] = useState("");

  const ask = useCallback(async ({ content, answer, context }: OceeQuestion) => {
    const c = content.trim();
    const a = answer.trim();
    if (!c || !a) {
      setOpinion("Nhập nội dung và đáp án trước khi nhờ OCee kiểm tra.");
      return;
    }
    setAsking(true);
    setOpinion("");
    try {
      const question =
        `Cho ý kiến soạn câu bank${context ? ` (${context})` : ""}: ` +
        `nội dung "${c}", đáp án "${a}". ` +
        "Góp ý ngắn gọn: lỗi sai hoặc độ mơ hồ, 2 phương án gây nhầm, độ khó, nguy cơ lộ đáp án.";
      const json = await apiSend<{ answer?: unknown }>("POST", "/agent/ask", {
        question,
      });
      setOpinion(String(json.data?.answer ?? "(trống)"));
    } catch (err) {
      if (err instanceof ApiError) setOpinion(`Lỗi: ${err.message}`);
      else {
        logger.error("Error asking OCee:", err);
        setOpinion("Lỗi kết nối OCee.");
      }
    } finally {
      setAsking(false);
    }
  }, []);

  const clear = useCallback(() => setOpinion(""), []);

  return { asking, opinion, ask, clear };
}

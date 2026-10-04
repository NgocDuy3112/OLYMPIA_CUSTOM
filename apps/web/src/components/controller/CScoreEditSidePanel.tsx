import { useEffect, useState } from "react";
import { apiGet, apiSend, ApiError } from "@/api/client";
import { createLogger } from "@/utils/logger";
import { SidePanel } from "@/components/shared/ui/SidePanel";
import { formInputClass, formLabelClass } from "@/components/shared/ui/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { notifyApiError } from "@/lib/notify";

const logger = createLogger("CScoreEditSidePanel");

interface QuestionOption {
  question_code: string;
  content?: string;
}

interface CScoreEditSidePanelProps {
  open: boolean;
  playerCode: string;
  playerName: string;
  matchCode: string;
  currentScore: number;
  onClose: () => void;
  onSaved: (score: number) => void;
}

export default function CScoreEditSidePanel({
  open,
  playerCode,
  playerName,
  matchCode,
  currentScore,
  onClose,
  onSaved,
}: CScoreEditSidePanelProps) {
  const [questions, setQuestions] = useState<QuestionOption[]>([]);
  const [questionCode, setQuestionCode] = useState("");
  const [points, setPoints] = useState("0");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const apply = (data?: QuestionOption[] | null) => {
      if (cancelled) return;
      const list = Array.isArray(data) ? data : [];
      setQuestions(list);
      setQuestionCode((value) => value || list[0]?.question_code || "");
    };
    setLoading(true);
    apiGet<QuestionOption[]>(
      `/questions/?match_code=${encodeURIComponent(matchCode)}`,
    )
      .then((json) => apply(json.data))
      .catch((err) => {
        if (err instanceof ApiError) apply(null); // lỗi HTTP: vẫn set rỗng như trước
        else logger.error("Error fetching questions:", err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, matchCode]);

  const save = async () => {
    const score = Number(points);
    if (!questionCode || !Number.isInteger(score) || score % 5 !== 0) return;
    setSaving(true);
    try {
      const payload = {
        match_code: matchCode,
        user_code: playerCode,
        question_code: questionCode,
        points: score,
        reason: "controller_question_score_adjust",
      };
      const json = await apiSend<{
        scoreboard?: { user_code: string; cumulative_score: number }[];
      }>("PATCH", "/scoreboard/controller-adjust", payload);
      const scoreboard = json.data?.scoreboard ?? [];
      const updated = scoreboard.find(
        (entry) => entry.user_code === playerCode,
      );
      onSaved(updated?.cumulative_score ?? currentScore);
      onClose();
    } catch (error) {
      notifyApiError(error, "Không thể cập nhật điểm");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SidePanel open={open} onClose={onClose} title="Sửa điểm theo câu">
        <p className="text-sm text-brand mb-4">
          {playerName} ({playerCode})
        </p>
        <div className="flex flex-col gap-3">
          <label className={formLabelClass}>Câu hỏi</label>
          <NativeSelect
            value={questionCode}
            onChange={(event) => setQuestionCode(event.target.value)}
            disabled={loading}
            className="w-full"
          >
            {questions.map((question) => (
              <option
                key={question.question_code}
                value={question.question_code}
              >
                {question.question_code}
              </option>
            ))}
          </NativeSelect>
          <label className={formLabelClass}>
            Điểm câu (bội số của 5)
          </label>
          <Input
            type="number"
            step={5}
            value={points}
            onChange={(event) => setPoints(event.target.value)}
            className={formInputClass}
            autoFocus
          />
          <p className="text-xs text-muted-foreground">
            Tổng điểm hiện tại: {currentScore}
          </p>
        </div>
        <div className="flex gap-3 mt-6 justify-end">
          <Button
            variant="ghost"
            onClick={onClose}
            className="bg-accent/50 hover:bg-accent text-sm"
          >
            Huỷ
          </Button>
          <Button
            variant="default"
            onClick={() => void save()}
            disabled={saving || loading || !questionCode}
            className="disabled:opacity-50 text-sm font-semibold"
          >
            {saving ? "Đang lưu..." : "Lưu"}
          </Button>
        </div>
    </SidePanel>
  );
}

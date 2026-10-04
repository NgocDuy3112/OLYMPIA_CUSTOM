import { useCallback, useEffect, useState } from "react";
import { Bot, Check, RefreshCw, Search, X } from "lucide-react";
import { ApiError, apiCall, apiGet } from "@/api/client";
import { createLogger } from "@/utils/logger";
import { getMatchCode as readStoredMatchCode } from "@/utils/storage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { notifyError } from "@/lib/notify";

const logger = createLogger("CReviewsPage");

interface Candidate {
  userCode: string;
  userName: string;
  position: number | null;
  answerText: string;
}

interface Review {
  id: string;
  matchCode: string;
  questionCode: string;
  candidates: Candidate[];
  decisions: Record<string, string>;
  oceeSuggestion: { text?: string } | null;
  status: string;
  expiresAt: string | null;
}

const label = (c: Candidate) => `[${c.position ?? "?"}] ${c.userName}`;

const CReviewsPage = () => {
  const [matchCode, setMatchCode] = useState(readStoredMatchCode());
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<"pending" | "decided" | "all">("pending");
  const [decisions, setDecisions] = useState<Record<string, Record<string, string>>>({});
  const [ocee, setOcee] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const fetchReviews = useCallback(async () => {
    const code = matchCode.trim();
    if (!code) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ match_code: code });
      if (status !== "all") params.set("status", status);
      const json = await apiGet<Review[]>(
        `/score-reviews?${params.toString()}`,
      ).catch((err) => {
        if (err instanceof ApiError) return null;
        throw err;
      });
      if (json && Array.isArray(json.data)) {
        setReviews(json.data as Review[]);
      } else {
        setReviews([]);
      }
    } catch (err) {
      logger.error("Error fetching reviews:", err);
      setReviews([]);
    } finally {
      setLoading(false);
    }
  }, [matchCode, status]);

  useEffect(() => {
    void fetchReviews();
  }, [fetchReviews]);

  const setDecision = (reviewId: string, userCode: string, v: "dung" | "sai") => {
    setDecisions((prev) => ({
      ...prev,
      [reviewId]: { ...(prev[reviewId] ?? {}), [userCode]: v },
    }));
  };

  const askOcee = useCallback(async (reviewId: string) => {
    try {
      const json = await apiCall<{ text?: string }>(
        `/score-reviews/${encodeURIComponent(reviewId)}/ocee`,
        { method: "POST" },
      );
      setOcee((prev) => ({ ...prev, [reviewId]: json.data?.text ?? "" }));
    } catch (err) {
      if (err instanceof ApiError) {
        notifyError(`OCee thất bại: ${err.message}`);
      } else {
        logger.error("Error asking ocee:", err);
        notifyError("Lỗi kết nối OCee");
      }
    }
  }, []);

  const submit = useCallback(
    async (review: Review) => {
      const d = decisions[review.id] ?? {};
      const missing = review.candidates.filter((c) => d[c.userCode] !== "dung" && d[c.userCode] !== "sai");
      if (missing.length > 0) {
        notifyError(`Còn thiếu: ${missing.map(label).join(", ")}`);
        return;
      }
      setSaving(review.id);
      try {
        await apiCall(
          `/score-reviews/${encodeURIComponent(review.id)}/decision`,
          {
            method: "POST",
            body: JSON.stringify({ decisions: d }),
          },
        );
        await fetchReviews();
      } catch (err) {
        if (err instanceof ApiError) {
          notifyError(`Chốt thất bại: ${err.message}`);
        } else {
          logger.error("Error submitting decision:", err);
          notifyError("Lỗi kết nối khi chốt");
        }
      } finally {
        setSaving(null);
      }
    },
    [decisions, fetchReviews],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        <Input
          value={matchCode}
          onChange={(e) => setMatchCode(e.target.value)}
          placeholder="Mã trận đấu"
          className="flex-1 px-3 py-2 rounded-lg bg-accent/50 border border-border text-foreground  text-sm"
        />
        <NativeSelect
          value={status}
          onChange={(e) => setStatus(e.target.value as "pending" | "decided" | "all")}
        >
          <option value="pending">Chờ duyệt</option>
          <option value="decided">Đã chốt</option>
          <option value="all">Tất cả</option>
        </NativeSelect>
        <Button
          variant="default"
          onClick={() => void fetchReviews()}
          disabled={loading || !matchCode.trim()}
          className="gap-1 bg-role-controller text-background hover:bg-role-controller/85 disabled:opacity-50 text-sm"
        >
          {loading ? <RefreshCw size={14} className="animate-spin" /> : <Search size={14} />} Tải
        </Button>
      </div>
      {reviews.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {status === "pending" ? "Không có review chờ duyệt." : status === "decided" ? "Chưa có review đã chốt." : "Chưa có review."}
        </p>
      )}
      {reviews.map((r) => {
        const d = decisions[r.id] ?? r.decisions ?? {};
        const isDecided = r.status !== "pending";
        return (
          <div key={r.id} className="rounded-xl bg-accent/50 border border-border p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className=" text-sm text-role-controller">{r.questionCode}</p>
              <p className="text-xs text-muted-foreground">{r.status}</p>
            </div>
            {r.candidates.map((c) => {
              const v = d[c.userCode];
              return (
                <div key={c.userCode} className="flex items-center gap-2">
                  <p className="flex-1 text-sm text-foreground">
                    {v === "dung" ? "✅ " : v === "sai" ? "❌ " : "⏳ "}
                    <span className="font-semibold">{label(c)}</span>: {c.answerText || "(trống)"}
                  </p>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => setDecision(r.id, c.userCode, "dung")}
                    className={`rounded-lg ${v === "dung" ? "bg-success text-success-foreground" : "bg-accent text-muted-foreground hover:text-foreground"}`}
                    title="Đúng"
                  >
                    <Check size={16} />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    onClick={() => setDecision(r.id, c.userCode, "sai")}
                    className={`rounded-lg ${v === "sai" ? "bg-destructive text-destructive-foreground" : "bg-accent text-muted-foreground hover:text-foreground"}`}
                    title="Sai"
                  >
                    <X size={16} />
                  </Button>
                </div>
              );
            })}
            {(ocee[r.id] || r.oceeSuggestion?.text) && (
              <p className="text-xs text-muted-foreground bg-accent/50 rounded-lg p-2">
                🤖 OCee: {ocee[r.id] ?? r.oceeSuggestion?.text}
              </p>
            )}
            <div className="flex gap-2 justify-end">
              <Button
                variant="secondary"
                onClick={() => void askOcee(r.id)}
                disabled={isDecided}
                className="gap-1 bg-accent hover:bg-accent/80 disabled:opacity-50 text-xs text-foreground"
              >
                <Bot size={14} /> Nhờ OCee
              </Button>
              <Button
                variant="default"
                onClick={() => void submit(r)}
                disabled={saving === r.id || isDecided}
                className="bg-role-controller text-background hover:bg-role-controller/85 disabled:opacity-50 text-xs font-semibold"
              >
                {saving === r.id ? "Đang chốt..." : isDecided ? "Đã chốt" : "Xác nhận"}
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default CReviewsPage;

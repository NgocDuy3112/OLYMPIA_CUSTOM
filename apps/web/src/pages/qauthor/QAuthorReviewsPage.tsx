import { useCallback, useEffect, useState } from "react";
import { Bot, Check, RefreshCw, Search, X } from "lucide-react";
import { API_BASE_URL } from "@/configs";
import { createLogger } from "@/utils/logger";
import { getMatchCode as readStoredMatchCode } from "@/utils/storage";

const logger = createLogger("QAuthorReviewsPage");

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

const QAuthorReviewsPage = () => {
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
      const res = await fetch(
        `${API_BASE_URL}/score-reviews?${params.toString()}`,
        { credentials: "include" },
      );
      const json = await res.json();
      if (json.status === "success" && Array.isArray(json.data)) {
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
      const res = await fetch(
        `${API_BASE_URL}/score-reviews/${encodeURIComponent(reviewId)}/ocee`,
        { method: "POST", credentials: "include" },
      );
      const json = await res.json();
      if (res.ok) {
        setOcee((prev) => ({ ...prev, [reviewId]: json.data?.text ?? "" }));
      } else {
        alert(`OCee thất bại: ${json.message ?? "Lỗi không xác định"}`);
      }
    } catch (err) {
      logger.error("Error asking ocee:", err);
      alert("Lỗi kết nối OCee");
    }
  }, []);

  const submit = useCallback(
    async (review: Review) => {
      const d = decisions[review.id] ?? {};
      const missing = review.candidates.filter((c) => d[c.userCode] !== "dung" && d[c.userCode] !== "sai");
      if (missing.length > 0) {
        alert(`Còn thiếu: ${missing.map(label).join(", ")}`);
        return;
      }
      setSaving(review.id);
      try {
        const res = await fetch(
          `${API_BASE_URL}/score-reviews/${encodeURIComponent(review.id)}/decision`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ decisions: d }),
          },
        );
        const json = await res.json();
        if (res.ok) {
          await fetchReviews();
        } else {
          alert(`Chốt thất bại: ${json.message ?? "Lỗi không xác định"}`);
        }
      } catch (err) {
        logger.error("Error submitting decision:", err);
        alert("Lỗi kết nối khi chốt");
      } finally {
        setSaving(null);
      }
    },
    [decisions, fetchReviews],
  );

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold text-white">Duyệt điểm</h1>
      <div className="flex gap-2">
        <input
          value={matchCode}
          onChange={(e) => setMatchCode(e.target.value)}
          placeholder="Mã trận đấu"
          className="flex-1 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white font-mono text-sm"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as "pending" | "decided" | "all")}
          className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm"
        >
          <option value="pending">Chờ duyệt</option>
          <option value="decided">Đã chốt</option>
          <option value="all">Tất cả</option>
        </select>
        <button
          onClick={() => void fetchReviews()}
          disabled={loading || !matchCode.trim()}
          className="flex items-center gap-1 px-3 py-2 rounded-lg bg-green-700 hover:bg-green-600 disabled:opacity-50 text-sm text-white"
        >
          {loading ? <RefreshCw size={14} className="animate-spin" /> : <Search size={14} />} Tải
        </button>
      </div>
      {reviews.length === 0 && (
        <p className="text-sm text-gray-500">
          {status === "pending" ? "Không có review chờ duyệt." : status === "decided" ? "Chưa có review đã chốt." : "Chưa có review."}
        </p>
      )}
      {reviews.map((r) => {
        const d = decisions[r.id] ?? r.decisions ?? {};
        const isDecided = r.status !== "pending";
        return (
          <div key={r.id} className="rounded-xl bg-white/5 border border-white/10 p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="font-mono text-sm text-green-300">{r.questionCode}</p>
              <p className="text-xs text-gray-500">{r.status}</p>
            </div>
            {r.candidates.map((c) => {
              const v = d[c.userCode];
              return (
                <div key={c.userCode} className="flex items-center gap-2">
                  <p className="flex-1 text-sm text-white">
                    {v === "dung" ? "✅ " : v === "sai" ? "❌ " : "⏳ "}
                    <span className="font-semibold">{label(c)}</span>: {c.answerText || "(trống)"}
                  </p>
                  <button
                    onClick={() => setDecision(r.id, c.userCode, "dung")}
                    className={`p-1.5 rounded-lg ${v === "dung" ? "bg-green-600 text-white" : "bg-white/10 text-gray-400 hover:text-white"}`}
                    title="Đúng"
                  >
                    <Check size={16} />
                  </button>
                  <button
                    onClick={() => setDecision(r.id, c.userCode, "sai")}
                    className={`p-1.5 rounded-lg ${v === "sai" ? "bg-red-600 text-white" : "bg-white/10 text-gray-400 hover:text-white"}`}
                    title="Sai"
                  >
                    <X size={16} />
                  </button>
                </div>
              );
            })}
            {(ocee[r.id] || r.oceeSuggestion?.text) && (
              <p className="text-xs text-gray-400 bg-white/5 rounded-lg p-2">
                🤖 OCee: {ocee[r.id] ?? r.oceeSuggestion?.text}
              </p>
            )}
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => void askOcee(r.id)}
                disabled={isDecided}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 disabled:opacity-50 text-xs text-white"
              >
                <Bot size={14} /> Nhờ OCee
              </button>
              <button
                onClick={() => void submit(r)}
                disabled={saving === r.id || isDecided}
                className="px-4 py-1.5 rounded-lg bg-green-600 hover:bg-green-500 disabled:opacity-50 text-xs font-semibold text-white"
              >
                {saving === r.id ? "Đang chốt..." : isDecided ? "Đã chốt" : "Xác nhận"}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default QAuthorReviewsPage;

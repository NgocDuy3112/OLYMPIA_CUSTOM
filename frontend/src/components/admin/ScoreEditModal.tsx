import { useEffect, useState } from "react";
import { API_BASE_URL } from "@/configs";

interface QuestionOption {
    question_code: string;
    content?: string;
}

interface ScoreEditModalProps {
    open: boolean;
    playerCode: string;
    playerName: string;
    matchCode: string;
    token: string;
    currentScore: number;
    onClose: () => void;
    onSaved: (score: number) => void;
}

export default function ScoreEditModal({ open, playerCode, playerName, matchCode, token, currentScore, onClose, onSaved }: ScoreEditModalProps) {
    const [questions, setQuestions] = useState<QuestionOption[]>([]);
    const [questionCode, setQuestionCode] = useState("");
    const [points, setPoints] = useState("0");
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        setLoading(true);
        fetch(`${API_BASE_URL}/questions/?match_code=${encodeURIComponent(matchCode)}`, {
            headers: { Authorization: `Bearer ${token}` },
        })
            .then((response) => response.json())
            .then((json) => {
                if (cancelled) return;
                const list = Array.isArray(json.data) ? json.data : [];
                setQuestions(list);
                setQuestionCode((value) => value || list[0]?.question_code || "");
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => { cancelled = true; };
    }, [open, matchCode, token]);

    if (!open) return null;

    const save = async () => {
        const score = Number(points);
        if (!questionCode || !Number.isInteger(score) || score % 5 !== 0) return;
        setSaving(true);
        try {
            const response = await fetch(`${API_BASE_URL}/scoreboard/adjust`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ match_code: matchCode, user_code: playerCode, question_code: questionCode, points: score, reason: "admin_question_score_adjust" }),
            });
            const json = await response.json();
            if (!response.ok || json.status !== "success") throw new Error(json.detail ?? "Không thể cập nhật điểm");
            const scoreboard = json.data?.scoreboard ?? [];
            const updated = scoreboard.find((entry: { user_code: string; cummulative_score: number }) => entry.user_code === playerCode);
            onSaved(updated?.cummulative_score ?? currentScore);
            onClose();
        } catch (error) {
            alert(error instanceof Error ? error.message : "Không thể cập nhật điểm");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-blue-950 border border-blue-700 rounded-xl p-6 w-full max-w-sm shadow-2xl">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-blue-200">Sửa điểm theo câu</h3>
                    <button onClick={onClose} className="text-blue-400 hover:text-white">✕</button>
                </div>
                <p className="text-sm text-blue-300 mb-4">{playerName} ({playerCode})</p>
                <div className="flex flex-col gap-3">
                    <label className="text-xs text-blue-400">Câu hỏi</label>
                    <select value={questionCode} onChange={(event) => setQuestionCode(event.target.value)} disabled={loading} className="px-3 py-2 rounded-lg bg-blue-900 border border-blue-600 text-white">
                        {questions.map((question) => <option key={question.question_code} value={question.question_code}>{question.question_code}</option>)}
                    </select>
                    <label className="text-xs text-blue-400">Điểm câu (bội số của 5)</label>
                    <input type="number" step={5} value={points} onChange={(event) => setPoints(event.target.value)} className="px-3 py-2 rounded-lg bg-blue-900 border border-blue-600 text-white" autoFocus />
                    <p className="text-xs text-blue-300">Tổng điểm hiện tại: {currentScore}</p>
                </div>
                <div className="flex gap-3 mt-6 justify-end">
                    <button onClick={onClose} className="px-4 py-2 rounded-lg bg-blue-800 hover:bg-blue-700 text-sm">Huỷ</button>
                    <button onClick={() => void save()} disabled={saving || loading || !questionCode} className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-sm font-semibold">{saving ? "Đang lưu..." : "Lưu"}</button>
                </div>
            </div>
        </div>
    );
}

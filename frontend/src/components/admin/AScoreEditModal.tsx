import { useEffect, useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { API_BASE_URL } from "@/configs";
import { parseQuestionCode, type ParsedQuestionCode } from "@/utils/questionCodeParser";

interface QuestionOption {
    question_code: string;
    content?: string;
}

interface EnrichedQuestion extends QuestionOption {
    parsed: ParsedQuestionCode;
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

export default function AScoreEditModal({ open, playerCode, playerName, matchCode, token, currentScore, onClose, onSaved }: ScoreEditModalProps) {
    const [questions, setQuestions] = useState<QuestionOption[]>([]);
    const [questionCode, setQuestionCode] = useState("");
    const [points, setPoints] = useState("0");
    const [search, setSearch] = useState("");
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [recordedScores, setRecordedScores] = useState<Record<string, number>>({});

    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        setLoading(true);
        setSearch("");
        fetch(`${API_BASE_URL}/questions/?match_code=${encodeURIComponent(matchCode)}`, { headers: { Authorization: `Bearer ${token}` } })
            .then((response) => response.json())
            .then((json) => {
                if (cancelled) return;
                const list = Array.isArray(json.data) ? json.data : [];
                setQuestions(list);
                setQuestionCode(list[0]?.question_code ?? "");
                const chartData = json.data?.chart_data?.[playerCode] ?? [];
                setRecordedScores(Object.fromEntries(chartData.map((record: { question_code: string; points: number }) => [record.question_code, record.points])));
                setPoints(String(chartData.find((record: { question_code: string }) => record.question_code === list[0]?.question_code)?.points ?? 0));
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => { cancelled = true; };
    }, [open, matchCode, token]);

    const enrichedQuestions = useMemo<EnrichedQuestion[]>(() => questions.map((question) => ({ ...question, parsed: parseQuestionCode(question.question_code) })), [questions]);
    const groupedQuestions = useMemo(() => {
        const normalizedSearch = search.trim().toLowerCase();
        return enrichedQuestions
            .filter((question) => !normalizedSearch || `${question.parsed.phaseLabel} ${question.parsed.questionLabel} ${question.content ?? ""} ${question.question_code}`.toLowerCase().includes(normalizedSearch))
            .reduce<Record<string, EnrichedQuestion[]>>((groups, question) => {
                const key = question.parsed.phaseLabel;
                groups[key] ??= [];
                groups[key].push(question);
                return groups;
            }, {});
    }, [enrichedQuestions, search]);

    if (!open) return null;

    const selectedQuestion = enrichedQuestions.find((question) => question.question_code === questionCode);
    const score = Number(points);
    const canSave = Boolean(selectedQuestion) && Number.isInteger(score) && score % 5 === 0 && !saving && !loading;

    const save = async () => {
        if (!canSave || !selectedQuestion) return;
        setSaving(true);
        try {
            const response = await fetch(`${API_BASE_URL}/scoreboard/adjust`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ match_code: matchCode, user_code: playerCode, question_code: questionCode, points: score, reason: "admin_question_score_adjust" }),
            });
            const json = await response.json();
            if (!response.ok || json.status !== "success") throw new Error(json.detail ?? "Không thể cập nhật điểm");
            const updated = (json.data?.scoreboard ?? []).find((entry: { user_code: string; cumulative_score: number }) => entry.user_code === playerCode);
            onSaved(updated?.cumulative_score ?? currentScore);
            onClose();
        } catch (error) {
            alert(error instanceof Error ? error.message : "Không thể cập nhật điểm");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="score-edit-title">
            <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-blue-700 bg-blue-950 shadow-2xl">
                <div className="flex items-start justify-between border-b border-blue-800 px-6 py-4">
                    <div>
                        <h3 id="score-edit-title" className="text-lg font-bold text-blue-100">Sửa điểm theo câu</h3>
                        <p className="mt-1 text-sm text-blue-300">{playerName} · {playerCode}</p>
                    </div>
                    <button onClick={onClose} aria-label="Đóng" className="rounded-lg p-2 text-blue-400 hover:bg-blue-900 hover:text-white"><X size={18} /></button>
                </div>
                <div className="grid min-h-0 gap-4 p-6 md:grid-cols-[1.15fr_0.85fr]">
                    <div className="min-h-0">
                        <div className="relative mb-3">
                            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-400" />
                            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm câu hỏi..." aria-label="Tìm câu hỏi" className="w-full rounded-lg border border-blue-700 bg-blue-900 py-2 pl-9 pr-3 text-sm text-white outline-none focus:border-blue-400" />
                        </div>
                        <div className="max-h-[52vh] space-y-4 overflow-y-auto pr-1">
                            {loading ? <p className="py-8 text-center text-sm text-blue-300">Đang tải câu hỏi...</p> : Object.entries(groupedQuestions).map(([group, groupQuestions]) => (
                                <section key={group}>
                                    <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-blue-400">{group}</h4>
                                    <div className="space-y-2">
                                        {groupQuestions.sort((a, b) => a.parsed.sortOrder - b.parsed.sortOrder).map((question) => (
                                            <button key={question.question_code} onClick={() => { setQuestionCode(question.question_code); setPoints(String(recordedScores[question.question_code] ?? 0)); }} className={`w-full rounded-lg border p-3 text-left transition ${questionCode === question.question_code ? "border-blue-400 bg-blue-800" : "border-blue-800 bg-blue-900/60 hover:border-blue-600"}`}>
                                                <div className="text-sm font-semibold text-blue-100">{question.parsed.questionLabel}</div>
                                                <div className="mt-1 line-clamp-2 text-xs text-blue-300">{question.content || "Chưa có nội dung câu hỏi"}</div>
                                            </button>
                                        ))}
                                    </div>
                                </section>
                            ))}
                        </div>
                    </div>
                    <div className="rounded-xl border border-blue-800 bg-blue-900/60 p-4">
                        {selectedQuestion ? <>
                            <p className="text-xs uppercase tracking-wider text-blue-400">Câu đang chọn</p>
                            <h4 className="mt-2 font-semibold text-blue-100">{selectedQuestion.parsed.phaseLabel} · {selectedQuestion.parsed.questionLabel}</h4>
                            <p className="mt-2 text-sm text-blue-300">{selectedQuestion.content || "Chưa có nội dung câu hỏi"}</p>
                            <label className="mt-6 block text-xs text-blue-400">Điểm câu, bội số của 5</label>
                            <input type="number" step={5} value={points} onChange={(event) => setPoints(event.target.value)} className="mt-2 w-full rounded-lg border border-blue-600 bg-blue-950 px-3 py-2 text-white outline-none focus:border-blue-300" autoFocus />
                            <p className="mt-4 text-sm text-blue-300">Tổng điểm hiện tại: <strong className="text-white">{currentScore}</strong></p>
                            <p className="mt-1 text-xs text-blue-400">Điểm nhập là điểm thay thế cho câu này.</p>
                        </> : <p className="py-8 text-center text-sm text-blue-300">Chọn một câu để chỉnh điểm</p>}
                    </div>
                </div>
                <div className="flex justify-end gap-3 border-t border-blue-800 px-6 py-4">
                    <button onClick={onClose} className="rounded-lg bg-blue-800 px-4 py-2 text-sm hover:bg-blue-700">Huỷ</button>
                    <button onClick={() => void save()} disabled={!canSave} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold hover:bg-blue-500 disabled:opacity-50">{saving ? "Đang lưu..." : "Lưu thay đổi"}</button>
                </div>
            </div>
        </div>
    );
}

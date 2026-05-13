/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useEffect, useRef, useState } from "react";
import AQuestionBoard from "@/components/admin/AQuestionBoard";
import { PBasePageLayout } from "@/pages/player/PBasePageLayout";
import { RenderMedia } from "@/components/shared/RenderMedia";
import { useCountdownTimer } from "@/hooks/useCountdownTimer";
import { useMcSession } from "@/hooks/useMcSession";
import { useMcWebSocket } from "@/hooks/useMcWebSocket";
import { useMcPlayers } from "@/hooks/useMcPlayers";
import { useMcAnswer } from "@/hooks/useMcAnswer";
import { useQuestionState } from "@/hooks/useQuestionState";
import { API_BASE_URL } from "@/configs";

const CLUE_COUNT = 8;
const KEYWORD_QUESTION_CODE = "OC3_Q_GM_KEY";
type ClueState = "idle" | "active" | "used";
type RevealedHint = { text?: string; mediaUrl?: string };

function buildKeywordBanner(answer: string): string {
    const len = answer.length;
    if (/^[A-ZÀ-Ỹa-zà-ỹ]+$/u.test(answer)) return `TỪ KHOÁ GỒM CÓ ${len} CHỮ CÁI`;
    if (/^\d+$/.test(answer)) return `TỪ KHOÁ GỒM CÓ ${len} CHỮ SỐ`;
    return `TỪ KHOÁ GỒM CÓ ${len} KÝ TỰ`;
}

interface PlayerClueCardProps {
    index: number;
    state: ClueState;
    hintContent?: RevealedHint;
}

const PlayerClueCard: React.FC<PlayerClueCardProps> = ({ index, state, hintContent }) => {
    const base = "flex-1 h-24 sm:h-36 lg:h-44 flex items-center justify-center rounded-xl font-bold transition-all duration-200 select-none border-2";
    const styles: Record<ClueState, string> = {
        idle:   "bg-blue-900 border-blue-600 text-white",
        active: "bg-blue-500 border-blue-200 text-white shadow-lg ring-2 ring-blue-300",
        used:   "bg-blue-700 border-blue-500 text-white",
    };
    const showHint = (state === "active" || state === "used") && !!(hintContent?.text || hintContent?.mediaUrl);
    return (
        <div className={`${base} ${styles[state]}`} aria-label={`Gợi ý ${index}`}>
            {showHint ? (
                <div className="flex items-center justify-center w-full h-full p-2">
                    {hintContent!.mediaUrl
                        ? <RenderMedia mediaUrl={hintContent!.mediaUrl} />
                        : <span className="text-xl font-bold text-center leading-snug">{hintContent!.text}</span>
                    }
                </div>
            ) : (
                <span className="font-[SVN-Gratelos_Display] text-[60pt]">{index}</span>
            )}
        </div>
    );
};

const MGiaiMaPage = () => {
    const { matchCode, token } = useMcSession();
    const { lastMessage } = useMcWebSocket();
    const { timer, startSynced } = useCountdownTimer();
    const { currentQuestion, applyWsMessage } = useQuestionState();
    const { players, applyPlayersInfo, applyScoreUpdate, applyAnswers, applyRealTimeAnswer, clearAnswers } = useMcPlayers();
    const { questionAnswer, fetchAnswer, clearAnswer } = useMcAnswer(matchCode, token);
    const [keywordSubmittedCodes, setKeywordSubmittedCodes] = useState<Set<string>>(new Set());
    const [revealedHint, setRevealedHint] = useState<string | null>(null);
    const [keywordAnswer, setKeywordAnswer] = useState<string | null>(null);
    const [clueStates, setClueStates] = useState<ClueState[]>(() => Array(CLUE_COUNT).fill("idle"));
    const [revealedHints, setRevealedHints] = useState<Record<number, RevealedHint>>({});
    const [keywordBanner, setKeywordBanner] = useState("MẬT MÃ GỒM CÓ ... CHỮ CÁI");
    const activeClueIdxRef = useRef<number | null>(null);

    useEffect(() => {
        if (!matchCode || !token) return;
        const fetchKeywordQ = async () => {
            try {
                const url = `${API_BASE_URL}/questions/?match_code=${encodeURIComponent(matchCode)}&question_code=${encodeURIComponent(KEYWORD_QUESTION_CODE)}`;
                const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
                if (!res.ok) return;
                const data = await res.json();
                let payload: any = null;
                if (Array.isArray(data.data)) {
                    payload = data.data.find((q: any) => String(q?.question_code) === KEYWORD_QUESTION_CODE) ?? data.data[0] ?? null;
                } else {
                    payload = data.data ?? null;
                }
                const answer: string =
                    payload?.question?.correct_answers ??
                    payload?.question?.correct_answer ??
                    payload?.answer ??
                    payload?.correct_answer ??
                    "";
                if (answer) setKeywordBanner(buildKeywordBanner(answer));
            } catch {
                // keep default banner
            }
        };
        void fetchKeywordQ();
    }, [matchCode, token]);

    useEffect(() => {
        if (!lastMessage) return;
        const msg: any = lastMessage;
        applyWsMessage(msg);

        switch (msg?.type) {
            case "send_players_info":
                applyPlayersInfo(msg);
                break;
            case "start_the_timer":
                startSynced(Number(msg.time_limit ?? 0), msg.started_at);
                clearAnswers();
                setRevealedHint(null);
                break;
            case "player_score_updated":
                applyScoreUpdate(msg);
                break;
            case "clear_answers":
                clearAnswers();
                break;
            case "send_question": {
                void fetchAnswer(msg.question_code ?? "");
                const code: string = msg.question_code ?? "";
                const m = String(code).match(/(\d+)\s*$/);
                const newClueNumber = m ? Number(m[1]) : 0;
                if (newClueNumber >= 1 && newClueNumber <= CLUE_COUNT) {
                    const newIdx = newClueNumber - 1;
                    activeClueIdxRef.current = newIdx;
                    setClueStates((prev) =>
                        prev.map((s, i) => {
                            if (i === newIdx) return "active";
                            if (s === "active") return "used";
                            return s;
                        })
                    );
                }
                break;
            }
            case "keyword_submit": {
                const { user_code } = msg;
                if (user_code) setKeywordSubmittedCodes((prev) => new Set([...prev, user_code as string]));
                break;
            }
            case "clear_question":
                clearAnswer();
                setRevealedHint(null);
                setKeywordAnswer(null);
                setClueStates(Array(CLUE_COUNT).fill("idle"));
                setRevealedHints({});
                setKeywordSubmittedCodes(new Set());
                activeClueIdxRef.current = null;
                break;
            case "round_start":
                setRevealedHint(null);
                setKeywordAnswer(null);
                setClueStates(Array(CLUE_COUNT).fill("idle"));
                setRevealedHints({});
                setKeywordSubmittedCodes(new Set());
                activeClueIdxRef.current = null;
                break;
            case "show_hint": {
                setRevealedHint(msg.hint_content ?? null);
                const idx = activeClueIdxRef.current;
                if (idx !== null) {
                    setRevealedHints((prev) => ({
                        ...prev,
                        [idx]: { text: msg.hint_content ?? undefined, mediaUrl: msg.hint_media_source ?? undefined },
                    }));
                }
                break;
            }
            case "hide_hint":
                setRevealedHint(null);
                break;
            case "send_answers_to_players":
                applyAnswers(msg);
                break;
            case "send_keyword_answers":
                applyAnswers(msg);
                setKeywordSubmittedCodes(new Set());
                break;
            case "answer":
                applyRealTimeAnswer(msg);
                break;
            case "reveal_keyword_answer":
                setKeywordAnswer(msg.answer ?? null);
                break;
            default:
                break;
        }
    }, [lastMessage, applyWsMessage, startSynced, applyPlayersInfo, applyScoreUpdate, applyAnswers, applyRealTimeAnswer, clearAnswers, fetchAnswer, clearAnswer]);

    const clueGrid = (
        <div className="flex flex-col gap-3 w-full mb-3 px-3">
            <div className="w-full bg-blue-900 border-2 border-blue-600 rounded-xl px-4 py-2 text-center font-[SVN-Gratelos_Display] text-2xl lg:text-3xl font-bold text-white uppercase shadow">
                {keywordBanner}
            </div>
            <div className="grid grid-cols-4 gap-2 w-full">
                {Array.from({ length: CLUE_COUNT }, (_, i) => (
                    <PlayerClueCard
                        key={i}
                        index={i + 1}
                        state={clueStates[i]}
                        hintContent={revealedHints[i]}
                    />
                ))}
            </div>
        </div>
    );

    const questionWithAnswer = {
        ...currentQuestion,
        questionMediaURL: undefined,
        questionAnswer: questionAnswer ?? currentQuestion.questionAnswer,
    };

    return (
        <PBasePageLayout
            players={players.map((p) =>
                keywordSubmittedCodes.has(p.playerCode) ? { ...p, playerHasSubmittedKeyword: true } : p
            )}
            currentPlayerCode=""
        >
            <>
                {clueGrid}

                <AQuestionBoard
                    title="GIẢI MÃ"
                    question={questionWithAnswer}
                    timerDuration={timer}
                    boardHeightClass="h-[22vh]"
                    answerBoxHeightClass="min-h-[4rem]"
                />

                {revealedHint && (
                    <div className="mx-3 mt-2 p-4 bg-yellow-600 border-2 border-yellow-400 rounded-xl text-center font-bold text-white text-xl">
                        GỢI Ý: {revealedHint}
                    </div>
                )}

                {keywordAnswer && (
                    <div className="mx-3 mt-2 p-4 bg-blue-700 border-2 border-blue-400 rounded-xl text-center font-bold text-white text-xl">
                        TỪ KHOÁ: {keywordAnswer}
                    </div>
                )}
            </>
        </PBasePageLayout>
    );
};

export default MGiaiMaPage;

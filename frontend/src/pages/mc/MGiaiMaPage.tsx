
import React, { useEffect, useRef, useState } from "react";
import AQuestionBoard from "@/components/admin/AQuestionBoard";
import { PBasePageLayout } from "@/pages/player/PBasePageLayout";
import { RenderMedia } from "@/components/shared/RenderMedia";
import { useCountdownTimer } from "@/hooks/useCountdownTimer";
import { useMcSession } from "@/hooks/useMcSession";
import { useMcWebSocket } from "@/hooks/useMcWebSocket";
import { useMcPlayers } from "@/hooks/useMcPlayers";
import { useMcQuestionReveal } from "@/hooks/useMcQuestionReveal";
import { useQuestionState } from "@/hooks/useQuestionState";
import { API_BASE_URL } from "@/configs";

const CLUE_COUNT = 8;
const KEYWORD_QUESTION_CODE = "OC3_Q_GM_KEY";
type ClueState = "idle" | "active" | "used";
type RevealedHint = { text?: string; mediaUrl?: string };

function isMediaFilename(value: string): boolean {
    return /\.(mp3|ogg|wav|aac|m4a|mp4|webm|mov|jpg|jpeg|png|gif|webp|svg)(\?.*)?$/i.test(value.trim());
}

function buildKeywordBanner(answer: string): string {
    const trimmedLen = answer.replace(/\s/g, '').length;
    const noSpaceAnswer = answer.replace(/\s/g, '');
    if (/^[A-ZÀ-Ỹa-zà-ỹ]+$/u.test(noSpaceAnswer)) return `TỪ KHOÁ GỒM CÓ ${trimmedLen} CHỮ CÁI`;
    if (/^\d+$/.test(noSpaceAnswer)) return `TỪ KHOÁ GỒM CÓ ${trimmedLen} CHỮ SỐ`;
    return `TỪ KHOÁ GỒM CÓ ${trimmedLen} KÝ TỰ`;
}

interface PlayerClueCardProps {
    index: number;
    state: ClueState;
    hintContent?: RevealedHint;
}

const PlayerClueCard: React.FC<PlayerClueCardProps> = ({ index, state, hintContent }) => {
    const base = "flex-1 h-16 sm:h-20 lg:h-28 xl:h-36 flex items-center justify-center rounded-xl font-bold transition-all duration-200 select-none border-2";
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
                        : <span className="text-sm sm:text-base lg:text-lg xl:text-xl font-bold text-center leading-snug">{hintContent!.text}</span>
                    }
                </div>
            ) : (
                <span className="font-[SVN-Gratelos_Display] text-2xl sm:text-3xl lg:text-[40pt] xl:text-[50pt]">{index}</span>
            )}
        </div>
    );
};

const MGiaiMaPage = () => {
    const { matchCode, token } = useMcSession();
    const { lastMessage } = useMcWebSocket();
    const { timer, startSynced } = useCountdownTimer();
    const { currentQuestion, applyWsMessage } = useQuestionState();
    const { players, applyPlayersInfo, applyScoreUpdate, applyAnswers, applyKeywordSubmit, clearAnswers } = useMcPlayers();
    const { questionAnswer, fetchAnswer, clearAnswer } = useMcQuestionReveal(matchCode, token);
    const [_keywordSubmittedCodes, setKeywordSubmittedCodes] = useState<Set<string>>(new Set());
    const [_revealedHint, setRevealedHint] = useState<string | null>(null);
    const [_keywordAnswer, setKeywordAnswer] = useState<string | null>(null);
    const [clueStates, setClueStates] = useState<ClueState[]>(() => Array(CLUE_COUNT).fill("idle"));
    const [revealedHints, setRevealedHints] = useState<Record<number, RevealedHint>>({});
    const [keywordBanner, setKeywordBanner] = useState("MẬT MÃ GỒM CÓ ... CHỮ CÁI");
    const activeClueIdxRef = useRef<number | null>(null);

    const [hideQuestionContent, setHideQuestionContent] = useState(false);

    const [isKeywordPhase, setIsKeywordPhase] = useState(false);

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
                setIsKeywordPhase(msg.phase === "gm_keyword");
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

                setHideQuestionContent(false);
                break;
            }
            case "keyword_submit": {
                const { user_code } = msg;
                if (user_code) {
                    setKeywordSubmittedCodes((prev) => new Set([...prev, user_code as string]));

                    applyKeywordSubmit(msg);
                }
                break;
            }
            case "keyword_clues_locked": {

                break;
            }
            case "clear_question":
                clearAnswer();
                setRevealedHint(null);
                setKeywordAnswer(null);
                setClueStates(Array(CLUE_COUNT).fill("idle"));
                setRevealedHints({});
                setKeywordSubmittedCodes(new Set());
                setHideQuestionContent(false);
                setIsKeywordPhase(false);
                activeClueIdxRef.current = null;

                clearAnswers();
                break;
            case "round_start":
                setRevealedHint(null);
                setKeywordAnswer(null);
                setClueStates(Array(CLUE_COUNT).fill("idle"));
                setRevealedHints({});
                setKeywordSubmittedCodes(new Set());
                setHideQuestionContent(false);
                setIsKeywordPhase(false);
                activeClueIdxRef.current = null;

                clearAnswers();
                break;
            case "show_hint": {
                const hintContent = msg.hint_content ?? "";
                const hintMediaSource = msg.hint_media_source ?? "";

                const contentIsMedia = isMediaFilename(hintContent);
                const displayText = contentIsMedia ? hintMediaSource : hintContent;
                const displayMedia = contentIsMedia ? hintContent : hintMediaSource;
                setRevealedHint(displayText ?? null);
                setHideQuestionContent(true);

                const explicitIdx = Number(msg.clue_index);
                const hasExplicitIdx = Number.isInteger(explicitIdx) && explicitIdx >= 0 && explicitIdx < CLUE_COUNT;
                const idx = hasExplicitIdx ? explicitIdx : activeClueIdxRef.current;
                if (idx !== null) {
                    if (hasExplicitIdx) activeClueIdxRef.current = idx;
                    setClueStates((prev) => {
                        if (prev[idx] === "used") return prev;
                        return prev.map((s, i) => (i === idx ? "used" : s));
                    });
                    setRevealedHints((prev) => ({
                        ...prev,
                        [idx]: { text: displayText || undefined, mediaUrl: displayMedia || undefined },
                    }));
                }
                break;
            }
            case "hide_hint": {

                setRevealedHint(null);
                setHideQuestionContent(true);

                let idx: number | null = null;
                const explicitIdx = Number(msg.clue_index);
                if (Number.isInteger(explicitIdx) && explicitIdx >= 0 && explicitIdx < CLUE_COUNT) {
                    idx = explicitIdx;
                    activeClueIdxRef.current = explicitIdx;
                } else if (activeClueIdxRef.current !== null) {
                    idx = activeClueIdxRef.current;
                }
                if (idx !== null) {
                    setRevealedHints((prev) => {
                        if (!(idx! in prev)) return prev;
                        const next = { ...prev };
                        delete next[idx!];
                        return next;
                    });
                }
                break;
            }
            case "send_answers_to_players":
                applyAnswers(msg);
                break;
            case "send_keyword_answers":
                applyAnswers(msg);
                setKeywordSubmittedCodes(new Set());
                break;
            case "reveal_keyword_answer": {

                const answer = msg.answer ?? null;
                const banner = msg.keyword_banner ?? null;
                setKeywordAnswer(answer);
                if (answer) {
                    setKeywordBanner(banner || buildKeywordBanner(answer));
                }
                break;
            }
            case "send_keyword_info":

                {
                    const infoBanner = msg.banner;
                    if (typeof infoBanner === "string" && infoBanner) {
                        setKeywordBanner(infoBanner);
                    }
                }
                break;
            default:
                break;
        }
    }, [lastMessage, applyWsMessage, startSynced, applyPlayersInfo, applyScoreUpdate, applyAnswers, applyKeywordSubmit, clearAnswers, fetchAnswer, clearAnswer]);

    const clueGrid = (
        <div className="flex flex-col gap-2 sm:gap-3 w-full mb-2 sm:mb-3 px-1 sm:px-3">
            <div className="w-full bg-blue-900 border-2 border-blue-600 rounded-xl px-2 sm:px-4 py-1.5 sm:py-2 text-center font-[SVN-Gratelos_Display] text-lg sm:text-2xl lg:text-3xl font-bold text-white uppercase shadow">
                {_keywordAnswer ? `${_keywordAnswer}` : keywordBanner}
            </div>
            <div className="grid grid-cols-4 gap-1.5 sm:gap-2 w-full">
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
        questionAnswer: questionAnswer ?? currentQuestion.questionAnswer,
    };

    const questionToShow = isKeywordPhase
        ? { ...questionWithAnswer, questionText: keywordBanner, questionMediaURL: undefined }
        : questionWithAnswer;

    return (
        <PBasePageLayout
            players={players}
            currentPlayerCode=""
        >
            <>
                {clueGrid}

                <AQuestionBoard
                    title="GIẢI MÃ"
                    question={questionToShow}
                    timerDuration={timer}
                    boardHeightClass="h-[22vh] sm:h-[25vh] lg:h-[28vh]"
                    controls={{ variant: 'numbers', count: 0 }}
                    hideContent={hideQuestionContent || isKeywordPhase}
                />
            </>
        </PBasePageLayout>
    );
};

export default MGiaiMaPage;

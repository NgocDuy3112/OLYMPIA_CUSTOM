/**
 * VeDichRiengPage — Unified page for Về Đích Cá Nhân (individual final).
 *
 * Admin: question grid, power system, buzzer, turn-based scoring.
 * MC: read-only audience view.
 * Player: buzzer, power selection, question display.
 */
import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import { mapQuestionApiPayload } from "@/utils/questionMapper";
import { useNavigate, useParams } from "react-router-dom";
import { AlarmClockCheck, ListRestart, Power, Zap, Plus, Minus, SkipForward, Star, Shield } from "lucide-react";

import { useGameWebSocket } from "@/hooks/useGameWebSocket";
import { usePlayerRound } from "@/hooks/usePlayerRound";
import { usePlayerTelemetry } from "@/hooks/usePlayerTelemetry";
import { useQuestionTimerLock } from "@/hooks/useQuestionTimerLock";
import { useRoleSession } from "@/hooks/useRoleSession";
import { createLogger } from "@/utils/logger";
import { buildPlayersSnapshot } from "@/utils/playerHelpers";
import { compareVeDichCodes, getVeDichMeta } from "@/utils/veDichGrid";
import { submitBuzz } from "@/api/answers";
import { loadAdminPlayersSnapshot } from "@/api/adminPlayers";
import { calculateScore } from "@/api/scores";
import { sendStartTimer } from "@/utils/wsStartTimer";
import { endRoundAndReturnToWaiting } from "@/utils/adminRoundNavigation";
import type { PlayerStatus } from "@/types/player";
import type { Question } from "@/types/question";
import { API_BASE_URL } from "@/configs";

import ABasePageLayout from "@/pages/admin/ABasePageLayout";
import AControlButton from "@/components/admin/AControlButton";
import APlayerBar from "@/components/admin/APlayerBar";
import VeDichQuestionCard from "@/components/shared/VeDichQuestionCard";
import PQuestionBoard from "@/components/player/PQuestionBoard";
import { PSubmitButton } from "@/components/player/PSubmitButton";
import { PBasePageLayout } from "@/pages/player/PBasePageLayout";
import { VeDichAudiencePage } from "@/components/shared/VeDichAudiencePage";

const logger = createLogger("VeDichRiengPage");
const DEFAULT_QUESTION: Question = { questionCode: "", questionText: "", questionAnswer: "", questionExplanation: "", questionMediaURL: undefined };
const ROUND_QUESTION_COUNT = 3;
const getTimeLimitForPoints = (points: number): number => { switch (points) { case 20: return 15; case 30: return 20; case 40: return 30; case 50: return 45; default: return 0; } };

// ─── Admin View ─────────────────────────────────────────────────────────────
const AdminVeDichRiengView = () => {
  const navigate = useNavigate();
  const { matchCode: urlMatchCode } = useParams<{ matchCode: string }>();
  const storedMatchCode = localStorage.getItem("matchCode");
  const currentMatchCode = urlMatchCode || storedMatchCode || "";

  useEffect(() => { if (urlMatchCode && urlMatchCode !== storedMatchCode) { try { localStorage.setItem("matchCode", urlMatchCode); } catch {} } }, [urlMatchCode, storedMatchCode]);
  useEffect(() => { if (!currentMatchCode) navigate("/admin/manage"); }, [currentMatchCode, navigate]);

  const { lastMessage, sendMessage } = useGameWebSocket();
  const [players, setPlayers] = useState<PlayerStatus[]>([]);
  usePlayerTelemetry({ lastMessage, sendMessage, players, setPlayers });
  const [selectedPlayerCodes, setSelectedPlayerCodes] = useState<string[]>([]);
  const toggleSelectedPlayer = useCallback((playerCode: string) => { setSelectedPlayerCodes(prev => prev.includes(playerCode) ? prev.filter(c => c !== playerCode) : [...prev, playerCode]); }, []);

  const [questions, setQuestions] = useState<Question[]>([]);
  const [questionCategories, setQuestionCategories] = useState<string[]>([]);
  const [questionPoints, setQuestionPoints] = useState<number[]>([]);
  const [questionStates, setQuestionStates] = useState<Record<string, "answered" | "answered-wrong" | "available">>(() => { if (!currentMatchCode) return {}; try { const stored = localStorage.getItem(`vd_rieng_states_${currentMatchCode}`); return stored ? JSON.parse(stored) : {}; } catch { return {}; } });
  const [currentQuestion, setCurrentQuestion] = useState<Question>({ ...DEFAULT_QUESTION });
  const pendingQuestionRef = useRef<{ questionCode: string; question: Question } | null>(null);
  const pendingBroadcastTimerRef = useRef<number | null>(null);
  const clearPendingBroadcastTimer = useCallback(() => { if (pendingBroadcastTimerRef.current != null) { window.clearTimeout(pendingBroadcastTimerRef.current); pendingBroadcastTimerRef.current = null; } }, []);
  const broadcastPendingVeDichQuestion = useCallback(() => { const pending = pendingQuestionRef.current; if (!pending || !currentMatchCode) return; void sendMessage({ type: "send_question", user_code: "", question_code: pending.questionCode, content: pending.question.questionText ?? "", media_source: pending.question.questionMediaURL ?? undefined }); if (pending.question.questionMediaURL) { void sendMessage({ type: "media_control", action: "play" }); setVideoPlayState("playing"); } pendingQuestionRef.current = null; clearPendingBroadcastTimer(); }, [currentMatchCode, sendMessage, clearPendingBroadcastTimer]);

  const [roundQuestionCodes, setRoundQuestionCodes] = useState<string[]>(() => { if (!currentMatchCode) return []; try { const stored = localStorage.getItem(`vd_rieng_codes_${currentMatchCode}`); return stored ? JSON.parse(stored) : []; } catch { return []; } });
  const [currentTurnPlayerCode, setCurrentTurnPlayerCode] = useState<string | null>(() => { if (!currentMatchCode) return null; try { return localStorage.getItem(`vd_rieng_selected_player_${currentMatchCode}`) || null; } catch { return null; } });
  const [usedPowers, setUsedPowers] = useState<Record<string, string | null>>(() => { if (!currentMatchCode) return {}; try { const stored = localStorage.getItem(`vd_powers_${currentMatchCode}`); if (!stored) return {}; const parsed = JSON.parse(stored); const migrated: Record<string, string | null> = {}; for (const [code, val] of Object.entries(parsed)) { if (typeof val === "string" || val === null) migrated[code] = val; else if (typeof val === "object" && val !== null) migrated[code] = (val as any).star ? "star" : (val as any).shield ? "shield" : null; else migrated[code] = null; } return migrated; } catch { return {}; } });
  const [activePower, setActivePower] = useState<'star' | 'shield' | null>(null);
  const [buzzerWinnerCode, setBuzzerWinnerCode] = useState<string | null>(null);
  const lastBuzzerQuestionRef = useRef<string | null>(null);
  const [timer, setTimer] = useState<number>(0);
  const timerRef = useRef<number>(0);
  const [isTimerRunning, setIsTimerRunning] = useState<boolean>(false);
  const { isLocked: isTimerLocked, lock: lockTimer } = useQuestionTimerLock(currentQuestion.questionCode);
  const [answeringWindowTimer, setAnsweringWindowTimer] = useState<number>(0);
  const [videoPlayState, setVideoPlayState] = useState<"playing" | "paused" | null>(null);
  const wasTimerRunningRef = useRef<boolean>(false);

  const questionTitle = "VỀ ĐÍCH - LƯỢT CÁ NHÂN";
  const currentPoints = (() => { if (!currentQuestion.questionCode) return 0; const idx = questions.findIndex(q => q.questionCode === currentQuestion.questionCode); return questionPoints[idx] || 0; })();

  useEffect(() => { if (!currentMatchCode) return; localStorage.setItem(`vd_rieng_states_${currentMatchCode}`, JSON.stringify(questionStates)); const answeredCodes = Object.entries(questionStates).filter(([, v]) => v === "answered").map(([k]) => k); if (answeredCodes.length > 0) { try { const existing = JSON.parse(localStorage.getItem(`vd_used_codes_${currentMatchCode}`) ?? "[]") as string[]; localStorage.setItem(`vd_used_codes_${currentMatchCode}`, JSON.stringify([...new Set([...existing, ...answeredCodes])])); } catch {} } }, [questionStates, currentMatchCode]);
  useEffect(() => { if (!currentMatchCode) return; localStorage.setItem(`vd_powers_${currentMatchCode}`, JSON.stringify(usedPowers)); }, [usedPowers, currentMatchCode]);
  useEffect(() => { setActivePower(null); if (currentMatchCode) void sendMessage({ type: "vd_power_activated", power: null }); }, [currentQuestion.questionCode, currentMatchCode, sendMessage]);

  const applyPlayersSnapshot = useCallback((payload: { players?: any[]; scoreboard?: any[]; profiles?: any[] }) => { const playersList = Array.isArray(payload?.players) ? payload.players : []; const scoreboardList = Array.isArray(payload?.scoreboard) ? payload.scoreboard : []; const profileList = Array.isArray(payload?.profiles) ? payload.profiles : []; setPlayers(prev => buildPlayersSnapshot(playersList, scoreboardList, profileList, prev)); }, []);
  const loadPlayersState = useCallback(async () => { if (!currentMatchCode) return undefined; try { const snapshot = await loadAdminPlayersSnapshot(currentMatchCode); setPlayers(prev => buildPlayersSnapshot(snapshot.players, snapshot.scoreboard, snapshot.profiles, prev)); return snapshot; } catch (err) { logger.error("Failed to load players:", err); return undefined; } }, [currentMatchCode]);

  const sendPlayersSnapshot = useCallback(async () => { if (!currentMatchCode) return; try { const payload = await loadPlayersState(); if (!payload) return; const mergedPlayers = (payload.players ?? []).map((p: any) => { const userCode = String(p?.user_code ?? p?.playerCode ?? ""); const profile = (payload.profiles ?? []).find((pr: any) => String(pr?.user_code) === userCode) ?? {}; const scoreEntry = (payload.scoreboard ?? []).find((s: any) => String(s?.user_code) === userCode) ?? {}; const cumulativeScore = scoreEntry?.cumulative_score ?? scoreEntry?.total_score ?? 0; const isAdminCode = currentTurnPlayerCode?.startsWith("ADMIN") ?? false; const isCurrent = !isAdminCode && currentTurnPlayerCode === userCode; return { user_code: userCode, user_name: profile?.user_name ?? p?.user_name ?? scoreEntry?.user_name ?? "", position: p?.position ?? undefined, cumulative_score: cumulativeScore, is_current: isCurrent }; }); await sendMessage({ type: "send_players_info", players: mergedPlayers }); } catch (err) { logger.error("Failed to send players snapshot:", err); } }, [currentMatchCode, loadPlayersState, sendMessage, currentTurnPlayerCode]);

  useEffect(() => { const fetchQuestions = async () => { if (!currentMatchCode) return; try { const res = await fetch(`${API_BASE_URL}/questions/?match_code=${encodeURIComponent(currentMatchCode)}`, { credentials: "include" }); if (!res.ok) return; const result = await res.json(); const raw = Array.isArray(result.data) ? result.data : [result.data].filter(Boolean); const veDichRaw = raw.filter((q: any) => q.question_code?.includes("_VD_") || q.question_code?.startsWith("OC3_Q_VD")); const mapped: Question[] = veDichRaw.map((q: any) => ({ questionCode: q.question_code, questionText: q.content, questionAnswer: q.answer, questionExplanation: q.explanation ?? "", questionMediaURL: q.media_url ?? undefined })); mapped.sort((a, b) => compareVeDichCodes(a.questionCode, b.questionCode)); setQuestions(mapped); setQuestionCategories(mapped.map((q, idx) => getVeDichMeta(q.questionCode, idx).category)); setQuestionPoints(mapped.map((q, idx) => getVeDichMeta(q.questionCode, idx).points)); } catch (err) { logger.error("Failed to fetch questions:", err); } }; fetchQuestions(); }, [currentMatchCode]);

  useEffect(() => { startTransition(() => { void sendPlayersSnapshot(); }); }, [sendPlayersSnapshot]);

  useEffect(() => { if (!currentMatchCode || questions.length === 0 || roundQuestionCodes.length === 0) return; const metadata = roundQuestionCodes.map(code => { const idx = questions.findIndex(q => q.questionCode === code); return { code, category: questionCategories[idx] ?? "", points: questionPoints[idx] ?? 0 }; }); void sendMessage({ type: "vdr_questions_meta", question_metadata: metadata }); }, [questions, roundQuestionCodes, questionCategories, questionPoints, currentMatchCode, sendMessage]);

  const sendSpecificRoundSnapshot = useCallback(async () => { if (roundQuestionCodes.length > 0 && questions.length > 0) { const metadata = roundQuestionCodes.map(code => { const idx = questions.findIndex(q => q.questionCode === code); return { code, category: questionCategories[idx] ?? "", points: questionPoints[idx] ?? 0 }; }); await sendMessage({ type: "vdr_questions_meta", question_metadata: metadata }); for (const [code, qState] of Object.entries(questionStates)) { if (qState === "answered" || qState === "answered-wrong") await sendMessage({ type: "vdr_question_state", question_code: code, state: qState }); } } if (currentQuestion.questionCode) { await sendMessage({ type: "send_question", user_code: "", question_code: currentQuestion.questionCode, content: currentQuestion.questionText ?? "", media_source: currentQuestion.questionMediaURL ?? undefined }); } if (timerRef.current > 0 && currentQuestion.questionCode) { await sendStartTimer({ sendMessage, phase: "vdr", timeLimit: timerRef.current, questionCode: currentQuestion.questionCode }); if (videoPlayState === "playing") await sendMessage({ type: "media_control", action: "play" }); } if (Object.keys(usedPowers).length > 0) await sendMessage({ type: "vd_powers_used", used_powers: usedPowers }); }, [currentQuestion, questionCategories, questionPoints, questionStates, questions, roundQuestionCodes, sendMessage, usedPowers, videoPlayState]);
  const sendRoundSnapshot = useCallback(async () => { await sendPlayersSnapshot(); await sendSpecificRoundSnapshot(); }, [sendPlayersSnapshot, sendSpecificRoundSnapshot]);

  const clearQuestion = useCallback(async () => { setCurrentQuestion({ ...DEFAULT_QUESTION }); setTimer(0); setAnsweringWindowTimer(0); setIsTimerRunning(false); setVideoPlayState(null); wasTimerRunningRef.current = false; pendingQuestionRef.current = null; clearPendingBroadcastTimer(); try { await sendMessage({ type: "clear_question", user_code: "" }); } catch (err) { logger.error("Failed to clear question:", err); } }, [sendMessage, clearPendingBroadcastTimer]);

  const handleQuestionActivate = useCallback(async (questionCode: string) => {
    if (isTimerRunning) return;
    if (currentQuestion.questionCode === questionCode) { setSelectedPlayerCodes([]); setUsedPowers({}); await clearQuestion(); return; }
    setSelectedPlayerCodes([]); setUsedPowers({}); setVideoPlayState(null); lastBuzzerQuestionRef.current = null; setBuzzerWinnerCode(null);
    setPlayers(prev => prev.map(p => ({ ...p, playerLastAnswer: undefined, playerTimestamp: undefined, playerHasBuzzed: undefined })));
    if (currentMatchCode) { void sendMessage({ type: "clear_buzz" }); void sendMessage({ type: "clear_answers", user_code: "" }); void sendMessage({ type: "send_question", user_code: "", question_code: questionCode, content: "", media_source: undefined }); void sendMessage({ type: "vd_power_window_open", duration: 5 }); }
    try { const res = await fetch(`${API_BASE_URL}/questions/?match_code=${encodeURIComponent(currentMatchCode ?? "")}&question_code=${encodeURIComponent(questionCode)}`, { credentials: "include" }); let q: Question; if (res.ok) { const data = await res.json(); let payload: any = null; if (Array.isArray(data.data)) payload = data.data.find((item: any) => String(item?.question_code) === String(questionCode)) ?? data.data[0] ?? null; else payload = data.data ?? null; q = mapQuestionApiPayload(payload, questionCode); } else q = { ...DEFAULT_QUESTION, questionCode }; setCurrentQuestion(q); pendingQuestionRef.current = { questionCode, question: q }; clearPendingBroadcastTimer(); pendingBroadcastTimerRef.current = window.setTimeout(() => { pendingBroadcastTimerRef.current = null; broadcastPendingVeDichQuestion(); }, 5500); } catch (err) { logger.error("handleQuestionActivate failed:", err); }
  }, [isTimerRunning, currentQuestion.questionCode, clearQuestion, currentMatchCode, sendMessage, clearPendingBroadcastTimer, broadcastPendingVeDichQuestion]);

  const startTheClock = useCallback(() => { if (!currentQuestion.questionCode || isTimerRunning || isTimerLocked) return; lockTimer(); const timeLimit = getTimeLimitForPoints(currentPoints); setTimer(timeLimit); setAnsweringWindowTimer(0); lastBuzzerQuestionRef.current = null; setBuzzerWinnerCode(null); setIsTimerRunning(true); if (currentMatchCode) void sendStartTimer({ sendMessage, phase: "vdr", timeLimit, questionCode: currentQuestion.questionCode }); }, [currentQuestion.questionCode, isTimerRunning, isTimerLocked, lockTimer, currentPoints, currentMatchCode, sendMessage]);
  useEffect(() => { timerRef.current = timer; }, [timer]);
  useEffect(() => { if (timer <= 0) return; const id = window.setInterval(() => { setTimer(prev => { const next = prev <= 1 ? 0 : prev - 1; timerRef.current = next; if (next === 0) window.clearInterval(id); return next; }); }, 1000); return () => window.clearInterval(id); }, [timer]);
  useEffect(() => { if (timer !== 0 || !isTimerRunning) return; startTransition(() => setIsTimerRunning(false)); }, [timer, isTimerRunning]);
  useEffect(() => { wasTimerRunningRef.current = isTimerRunning; }, [isTimerRunning]);
  useEffect(() => { if (isTimerRunning || answeringWindowTimer !== 0) return; if (!wasTimerRunningRef.current) return; const waitTimeoutId = setTimeout(() => { setAnsweringWindowTimer(5); }, 5000); return () => clearTimeout(waitTimeoutId); }, [isTimerRunning, answeringWindowTimer]);
  useEffect(() => { if (answeringWindowTimer <= 0) return; const id = window.setInterval(() => { setAnsweringWindowTimer(prev => { const next = prev <= 1 ? 0 : prev - 1; return next; }); }, 1000); return () => window.clearInterval(id); }, [answeringWindowTimer]);
  useEffect(() => { if (answeringWindowTimer !== 5 || !currentMatchCode) return; void sendMessage({ type: "answering_window_activated", countdown: 5 }); }, [answeringWindowTimer, currentMatchCode, sendMessage]);


  const handleAddPoints = useCallback(async () => { if (selectedPlayerCodes.length === 0 || !currentQuestion.questionCode) return; const answeredCode = currentQuestion.questionCode; setQuestionStates(prev => ({ ...prev, [answeredCode]: "answered" })); void sendMessage({ type: "vdr_question_state", question_code: answeredCode, state: "answered" }); void sendMessage({ type: "vd_dung", phase: "vdr" }); try { await calculateScore(currentMatchCode, answeredCode, "vdr_correct", selectedPlayerCodes); await sendPlayersSnapshot(); if (activePower && currentTurnPlayerCode) setUsedPowers(prev => ({ ...prev, [currentTurnPlayerCode]: activePower })); setActivePower(null); void sendMessage({ type: "vd_power_activated", power: null }); setSelectedPlayerCodes([]); } catch (err) { logger.error("handleAddPoints failed:", err); } }, [selectedPlayerCodes, currentQuestion.questionCode, activePower, currentTurnPlayerCode, sendPlayersSnapshot, sendMessage, currentMatchCode]);

  const handleSubtractPoints = useCallback(async () => { if (selectedPlayerCodes.length === 0 || !currentQuestion.questionCode) return; const answeredCode = currentQuestion.questionCode; setQuestionStates(prev => ({ ...prev, [answeredCode]: "answered" })); void sendMessage({ type: "vdr_question_state", question_code: answeredCode, state: "answered" }); void sendMessage({ type: "wrong", phase: "vdr" }); try { await calculateScore(currentMatchCode, answeredCode, "vdr_wrong", selectedPlayerCodes); await sendPlayersSnapshot(); if (activePower && currentTurnPlayerCode) setUsedPowers(prev => ({ ...prev, [currentTurnPlayerCode]: activePower })); setActivePower(null); void sendMessage({ type: "vd_power_activated", power: null }); setSelectedPlayerCodes([]); } catch (err) { logger.error("handleSubtractPoints failed:", err); } }, [selectedPlayerCodes, currentQuestion.questionCode, activePower, currentTurnPlayerCode, sendPlayersSnapshot, sendMessage, currentMatchCode]);

  const handleOpenBuzzer = useCallback(async () => { if (timer !== 0) return; setAnsweringWindowTimer(5); lastBuzzerQuestionRef.current = null; setBuzzerWinnerCode(null); setPlayers(prev => prev.map(p => ({ ...p, playerHasBuzzed: false }))); if (currentMatchCode) { void sendMessage({ type: "clear_buzz" }); void sendMessage({ type: "answering_window_activated", countdown: 5 }); } }, [timer, currentMatchCode, sendMessage]);

  const handleEndTurn = useCallback(async () => { setCurrentQuestion({ ...DEFAULT_QUESTION }); setTimer(0); setIsTimerRunning(false); setSelectedPlayerCodes([]); setCurrentTurnPlayerCode(null); setActivePower(null); setBuzzerWinnerCode(null); lastBuzzerQuestionRef.current = null; if (currentMatchCode) localStorage.removeItem(`vd_rieng_selected_player_${currentMatchCode}`); await Promise.all([clearQuestion(), sendMessage({ type: "blocked_buzz", user_code: null }), sendMessage({ type: "vd_power_activated", power: null }), sendMessage({ type: "navigate", user_code: "", path: "/player/vdr/pick" })]); if (currentMatchCode) navigate(`/admin/vdr/pick/${currentMatchCode}`); }, [clearQuestion, currentMatchCode, navigate, sendMessage]);

  const handleEndRound = useCallback(async () => { setCurrentQuestion({ ...DEFAULT_QUESTION }); setTimer(0); setIsTimerRunning(false); if (!currentMatchCode) return; try { await endRoundAndReturnToWaiting({ currentMatchCode, navigate, round: "vdr", sendMessage }); } catch (err) { logger.error("handleEndRound failed:", err); } }, [currentMatchCode, navigate, sendMessage]);

  useEffect(() => { if (!lastMessage) return; const msg: any = lastMessage; switch (msg?.type) { case "vd_questions_selected": { if (Array.isArray(msg.selected_question_codes) && msg.round === "rieng") { if (currentMatchCode) localStorage.setItem(`vd_rieng_codes_${currentMatchCode}`, JSON.stringify(msg.selected_question_codes)); startTransition(() => { setRoundQuestionCodes(msg.selected_question_codes); lastBuzzerQuestionRef.current = null; setBuzzerWinnerCode(null); }); } if (msg.selected_player_code) { const isAdminCode = String(msg.selected_player_code).startsWith("ADMIN"); if (!isAdminCode) { startTransition(() => setCurrentTurnPlayerCode(msg.selected_player_code)); if (currentMatchCode) localStorage.setItem(`vd_rieng_selected_player_${currentMatchCode}`, msg.selected_player_code); } } break; } case "player_offline": { if (msg.user_code) startTransition(() => { setPlayers(prev => prev.map(p => p.playerCode === msg.user_code ? { ...p, playerConnected: false } : p)); }); break; } case "send_players_info": startTransition(() => { applyPlayersSnapshot(msg); }); break; case "player_score_updated": { if (msg.user_code && typeof msg.new_total_score === "number") startTransition(() => { setPlayers(prev => prev.map(p => p.playerCode === msg.user_code ? { ...p, playerScore: msg.new_total_score } : p)); }); break; } case "clear_answers": startTransition(() => { setPlayers(prev => prev.map(p => ({ ...p, playerLastAnswer: undefined, playerTimestamp: undefined }))); }); break; case "send_answers_to_players": { const answers = Array.isArray(msg.answers) ? msg.answers : []; startTransition(() => { setPlayers(prev => prev.map(player => { const answer = answers.find((item: any) => item.user_code === player.playerCode); if (!answer) return player; return { ...player, playerLastAnswer: answer.content ?? answer.answer_text ?? player.playerLastAnswer, playerTimestamp: answer.timestamp ?? player.playerTimestamp }; })); }); break; } case "player_answer": case "answer": { const { user_code, answer_text, timestamp } = msg; if (user_code && answer_text) startTransition(() => { setPlayers(prev => prev.map(p => p.playerCode === user_code ? { ...p, playerLastAnswer: answer_text, playerTimestamp: timestamp ?? p.playerTimestamp } : p)); }); break; } case "buzzer_winner": { const winner = msg.user_code ?? ""; setBuzzerWinnerCode(winner || null); startTransition(() => { setPlayers(prev => prev.map(p => ({ ...p, playerHasBuzzed: winner ? p.playerCode === winner : false }))); }); if (winner && msg.question_code !== lastBuzzerQuestionRef.current) { lastBuzzerQuestionRef.current = msg.question_code; void sendMessage({ type: "blocked_buzz", user_code: null }); } break; } case "clear_buzz": setBuzzerWinnerCode(null); lastBuzzerQuestionRef.current = null; setPlayers(prev => prev.map(p => ({ ...p, playerHasBuzzed: false }))); break; case "vd_player_power": { const { user_code, power } = msg; if (user_code && (power === "star" || power === "shield") && !usedPowers[user_code]) { const nextUsedPowers = { ...usedPowers, [user_code]: power }; startTransition(() => { setUsedPowers(nextUsedPowers); setPlayers(prev => prev.map(p => p.playerCode === user_code ? { ...p, playerPower: power as "star" | "shield" } : p)); }); try { localStorage.setItem(`vd_powers_${currentMatchCode}`, JSON.stringify(nextUsedPowers)); } catch {} void sendMessage({ type: "vd_powers_used", used_powers: nextUsedPowers }); if (user_code === currentTurnPlayerCode) { startTransition(() => { setActivePower(power as "star" | "shield"); }); void sendMessage({ type: "vd_power_activated", power }); } } break; } case "vd_powers_used": { if (msg.used_powers) { startTransition(() => { setUsedPowers(msg.used_powers); setPlayers(prev => prev.map(p => { const power = msg.used_powers[p.playerCode]; return power ? { ...p, playerPower: power as "star" | "shield" } : p; })); }); try { localStorage.setItem(`vd_powers_${currentMatchCode}`, JSON.stringify(msg.used_powers)); } catch {} } break; } case "vd_power_window_closed": broadcastPendingVeDichQuestion(); break; } }, [applyPlayersSnapshot, lastMessage, sendMessage, sendRoundSnapshot, broadcastPendingVeDichQuestion]);

  const getQuestionMeta = (questionCode: string) => { const idx = questions.findIndex(q => q.questionCode === questionCode); const raw = questionCategories[idx] || "Unknown"; const pts = questionPoints[idx] || 0; const [catPrimary, catSecondary] = (raw || "").split("|").map(s => s?.trim()); return { catPrimary: catPrimary || raw, catSecondary, pts }; };

  return (
    <ABasePageLayout questionTitle={questionTitle} question={currentQuestion} videoPlayState={videoPlayState} timerDuration={timer}
      controlsChildren={() => (<div className="flex gap-3 overflow-x-auto">{Array.from({ length: ROUND_QUESTION_COUNT }).map((_, i) => { const code = roundQuestionCodes[i]; if (!code) return (<div key={`rq-empty-${i}`} className="w-32 sm:w-40 lg:w-55 shrink-0 h-16 sm:h-18 lg:h-20"><VeDichQuestionCard placeholder category="" disabled /></div>); const { catPrimary, catSecondary, pts } = getQuestionMeta(code); const state = questionStates[code] || "available"; const isActive = currentQuestion.questionCode === code; return (<div key={`rq-${code}`} className="w-55 shrink-0 h-20"><VeDichQuestionCard category={catPrimary} subcategory={catSecondary} points={pts} state={state} isSelected={isActive} disabled={state !== "available"} onClick={() => { if (state === "available" && !isTimerRunning) handleQuestionActivate(code); }} /></div>); })}</div>)}
      topControlButtons={null}
      playerSectionButtons={<>
        <AControlButton onClick={startTheClock} disabled={!currentQuestion.questionCode || isTimerRunning || isTimerLocked || !currentTurnPlayerCode} title={!currentTurnPlayerCode ? 'Vui lòng chọn thí sinh trước' : undefined}><AlarmClockCheck size={18} /><span className="ml-2 font-bold">ĐẾM GIỜ</span></AControlButton>
        <AControlButton onClick={handleOpenBuzzer} disabled={timer > 0 || answeringWindowTimer > 0 || !currentTurnPlayerCode} title={!currentTurnPlayerCode ? 'Vui lòng chọn thí sinh trước' : undefined}><Zap size={18} /><span className="ml-2 font-bold">MỞ CHUÔNG</span></AControlButton>
        <AControlButton onClick={() => { void handleAddPoints().catch(err => logger.error("Cộng điểm failed:", err)); }} disabled={selectedPlayerCodes.length === 0 || !currentQuestion.questionCode || !currentTurnPlayerCode || isTimerRunning} title={!currentTurnPlayerCode ? 'Vui lòng chọn thí sinh trước' : undefined}><Plus size={18} /><span className="ml-2 font-bold">CỘNG ĐIỂM</span></AControlButton>
        <AControlButton onClick={() => { void handleSubtractPoints().catch(err => logger.error("Trừ điểm failed:", err)); }} disabled={selectedPlayerCodes.length === 0 || !currentQuestion.questionCode || !currentTurnPlayerCode || isTimerRunning} title={!currentTurnPlayerCode ? 'Vui lòng chọn thí sinh trước' : undefined}><Minus size={18} /><span className="ml-2 font-bold">TRỪ ĐIỂM</span></AControlButton>
      </>}
      bottomActionButtons={<>
        <AControlButton onClick={() => navigate(`/admin/vdr/pick/${currentMatchCode ?? ""}`)} disabled={isTimerRunning}><ListRestart size={18} /><span className="ml-2 font-bold">CHỌN LẠI</span></AControlButton>
        <AControlButton onClick={() => { void handleEndTurn(); }} disabled={isTimerRunning || !currentTurnPlayerCode}><SkipForward size={18} /><span className="ml-2 font-bold">HẾT LƯỢT</span></AControlButton>
        <AControlButton onClick={() => { void handleEndRound(); }} disabled={isTimerRunning}><Power size={18} /><span className="ml-2 font-bold">KẾT THÚC</span></AControlButton>
      </>}
      renderPlayerList={() => players.map(player => (<APlayerBar key={player.playerCode} player={player} isActive={selectedPlayerCodes.includes(player.playerCode)} isCurrent={player.playerCode === currentTurnPlayerCode} playerPower={usedPowers[player.playerCode] as "star" | "shield" | undefined} isBuzzerWinner={player.playerCode === buzzerWinnerCode} onClick={toggleSelectedPlayer} disabled={timer > 0} onEditScore={() => {}} matchCode={currentMatchCode} sendMessage={sendMessage} />))}
    />
  );
};

// ─── Player View ────────────────────────────────────────────────────────────
type RoundQuestion = { code: string; category: string; points: number };
const PlayerVeDichRiengView = () => {
  const { matchCode, playerCode } = useRoleSession("player");
  const { isConnected, lastMessage, sendMessage, timer, startSynced, currentQuestion, applyWsMessage, players, setPlayers, applyPlayersInfo, applyScoreUpdate, videoPlayState, setVideoPlayState } = usePlayerRound();

  const [hasPinged, setHasPinged] = useState(false);
  const hasPingedRef = useRef(false);
  const [buzzerWinnerCode, setBuzzerWinnerCode] = useState<string | null>(null);
  const [blockedPlayerCode, setBlockedPlayerCode] = useState<string | null>(null);
  const [currentTurnPlayerCode, setCurrentTurnPlayerCode] = useState<string | null>(null);
  const [answeringWindowTimer, setAnsweringWindowTimer] = useState(0);
  const [activePower, setActivePower] = useState<"star" | "shield" | null>(null);
  const [roundQuestionsData, setRoundQuestionsData] = useState<RoundQuestion[]>([]);
  const [questionStates, setQuestionStates] = useState<Record<string, "answered" | "answered-wrong" | "available">>({});
  const [usedPowers, setUsedPowers] = useState<Record<string, string | null>>(() => { if (!matchCode) return {}; try { return JSON.parse(localStorage.getItem(`vd_powers_${matchCode}`) ?? "{}"); } catch { return {}; } });
  const [powerWindowOpen, setPowerWindowOpen] = useState(false);
  const [powerWindowCountdown, setPowerWindowCountdown] = useState(0);
  const [selectedPower, setSelectedPower] = useState<"star" | "shield" | null>(null);
  const powerWindowTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!lastMessage) return;
    const msg = lastMessage.message ?? lastMessage;
    queueMicrotask(() => {
      applyWsMessage(msg);
      if (msg?.type === "send_question" || msg?.type === "clear_question") setVideoPlayState(null);
      switch (msg?.type) {
        case "send_players_info": applyPlayersInfo(msg); break;
        case "player_score_updated": applyScoreUpdate(msg); break;
        case "start_the_timer": hasPingedRef.current = false; setHasPinged(false); setBuzzerWinnerCode(null); setAnsweringWindowTimer(0); startSynced(Number(msg.time_limit ?? 0), Number(msg.started_at ?? Date.now())); setPlayers(prev => prev.map(p => ({ ...p, playerHasBuzzed: false }))); break;
        case "media_control": setVideoPlayState(msg.action === "pause" ? "paused" : "playing"); break;
        case "vd_power_activated": setActivePower(msg.power ?? null); break;
        case "vd_power_window_open": { const eligible = msg.eligible_user_codes; if (Array.isArray(eligible) && !eligible.includes(playerCode ?? "")) break; setPowerWindowOpen(true); setPowerWindowCountdown(Number(msg.duration ?? 5)); setSelectedPower(null); break; }
        case "vd_player_power": { const { user_code, power } = msg; if (user_code && (power === "star" || power === "shield")) { setUsedPowers(prev => { const next = { ...prev, [user_code]: power }; try { localStorage.setItem(`vd_powers_${matchCode}`, JSON.stringify(next)); } catch {} return next; }); setPlayers(prev => prev.map(p => p.playerCode === user_code ? { ...p, playerPower: power } : p)); } break; }
        case "vd_powers_used": { if (msg.used_powers) { setUsedPowers(msg.used_powers); try { localStorage.setItem(`vd_powers_${matchCode}`, JSON.stringify(msg.used_powers)); } catch {} setPlayers(prev => prev.map(p => { const power = msg.used_powers[p.playerCode]; return power ? { ...p, playerPower: power } : p; })); } break; }
        case "buzzer_winner": { const winner = String(msg.user_code ?? ""); if (winner) { setBuzzerWinnerCode(winner); setPlayers(prev => prev.map(p => ({ ...p, playerHasBuzzed: p.playerCode === winner }))); } break; }
        case "clear_buzz": hasPingedRef.current = false; setHasPinged(false); setBuzzerWinnerCode(null); setPlayers(prev => prev.map(p => ({ ...p, playerHasBuzzed: false }))); break;
        case "blocked_buzz": setBlockedPlayerCode(msg.user_code === null || msg.user_code === undefined ? "*ALL*" : msg.user_code === "" ? null : String(msg.user_code)); break;
        case "vd_questions_selected": case "vdr_questions_meta": { const metadata: RoundQuestion[] = msg.question_metadata ?? []; if (metadata.length > 0) setRoundQuestionsData(metadata); if (msg.round === "rieng" && msg.selected_player_code) setCurrentTurnPlayerCode(msg.selected_player_code); if (msg.type === "vd_questions_selected") { hasPingedRef.current = false; setHasPinged(false); setBuzzerWinnerCode(null); setPlayers(prev => prev.map(p => ({ ...p, playerHasBuzzed: false }))); } break; }
        case "vdr_question_state": { const { question_code, state: qState } = msg; if (question_code && qState) setQuestionStates(prev => ({ ...prev, [question_code]: qState })); break; }
        case "answering_window_activated": setAnsweringWindowTimer(5); break;
      }
    });
  }, [matchCode, playerCode, setPlayers, applyWsMessage]);

  useEffect(() => { if (answeringWindowTimer <= 0) return; const id = window.setInterval(() => setAnsweringWindowTimer(prev => prev <= 1 ? 0 : prev - 1), 1000); return () => window.clearInterval(id); }, [answeringWindowTimer]);
  useEffect(() => { if (!powerWindowOpen || powerWindowCountdown <= 0) return; powerWindowTimerRef.current = window.setInterval(() => { setPowerWindowCountdown(prev => { if (prev <= 1) { setPowerWindowOpen(false); void sendMessage({ type: "vd_power_window_closed", user_code: playerCode }); return 0; } return prev - 1; }); }, 1000); return () => { if (powerWindowTimerRef.current) window.clearInterval(powerWindowTimerRef.current); }; }, [powerWindowOpen, powerWindowCountdown, playerCode, sendMessage]);
  useEffect(() => () => { if (powerWindowTimerRef.current) window.clearInterval(powerWindowTimerRef.current); }, []);

  const handlePing = useCallback(async () => { if (!isConnected || hasPingedRef.current || buzzerWinnerCode || blockedPlayerCode === playerCode || currentTurnPlayerCode === playerCode || !currentQuestion.questionCode || answeringWindowTimer <= 0) return; hasPingedRef.current = true; setHasPinged(true); try { await submitBuzz({ user_code: playerCode, match_code: matchCode, question_code: currentQuestion.questionCode, has_buzzed: true }); } catch {} await sendMessage({ type: "buzz", user_code: playerCode, question_code: currentQuestion.questionCode, has_buzzed: true }); }, [buzzerWinnerCode, currentQuestion.questionCode, isConnected, playerCode, sendMessage, matchCode, blockedPlayerCode, currentTurnPlayerCode, answeringWindowTimer]);

  const handleSelectPower = useCallback(async (power: "star" | "shield") => { if (!powerWindowOpen || usedPowers[playerCode]) return; setSelectedPower(power); setPowerWindowOpen(false); await sendMessage({ type: "vd_player_power", user_code: playerCode, power }); }, [powerWindowOpen, usedPowers, playerCode, sendMessage]);

  const isPingDisabled = hasPinged || !isConnected || !!buzzerWinnerCode || blockedPlayerCode === playerCode || currentTurnPlayerCode === playerCode || answeringWindowTimer <= 0;
  const currentPoints = roundQuestionsData.find(r => r.code === currentQuestion.questionCode)?.points ?? 0;

  return (
    <PBasePageLayout players={players} currentPlayerCode={playerCode} currentTurnPlayerCode={currentTurnPlayerCode} buzzerWinnerCode={buzzerWinnerCode}>
      <PQuestionBoard title="VỀ ĐÍCH - LƯỢT CÁ NHÂN" question={currentQuestion} timerDuration={answeringWindowTimer > 0 ? answeringWindowTimer : timer} videoPlayState={videoPlayState}>
        <div className="flex gap-1 overflow-x-auto">
          {roundQuestionsData.length > 0 ? roundQuestionsData.map(q => { const qState = questionStates[q.code] ?? "available"; return (<div key={q.code} className="w-32 sm:w-40 lg:w-55 shrink-0 h-16 sm:h-18 lg:h-20"><VeDichQuestionCard category={q.category} points={q.points} state={qState} isSelected={currentQuestion.questionCode === q.code} disabled={qState !== "available"} /></div>); }) : Array.from({ length: 3 }).map((_, i) => (<div key={`ph-${i}`} className="w-32 sm:w-40 lg:w-55 shrink-0 h-16 sm:h-18 lg:h-20"><VeDichQuestionCard placeholder category="" disabled /></div>))}
        </div>
      </PQuestionBoard>
      {powerWindowOpen && !usedPowers[playerCode] && (
        <div className="bg-blue-900 border-2 border-blue-400 rounded-xl p-4 flex flex-col items-center gap-3">
          <p className="text-white font-bold text-lg">Chọn quyền năng ({powerWindowCountdown}s)</p>
          <div className="flex gap-4">
            <button onClick={() => void handleSelectPower('star')} disabled={currentPoints === 20} className={`flex items-center gap-2 px-4 py-3 rounded-xl font-bold transition-all ${selectedPower === 'star' ? 'bg-yellow-500 text-blue-900' : 'bg-yellow-500/20 text-yellow-300 border-2 border-yellow-500/50'} ${currentPoints === 20 ? 'opacity-40' : ''}`}><Star size={20} /><span>Ngôi Sao Hy Vọng</span></button>
            <button onClick={() => void handleSelectPower('shield')} disabled={currentPoints === 50} className={`flex items-center gap-2 px-4 py-3 rounded-xl font-bold transition-all ${selectedPower === 'shield' ? 'bg-blue-500 text-blue-900' : 'bg-blue-500/20 text-blue-300 border-2 border-blue-500/50'} ${currentPoints === 50 ? 'opacity-40' : ''}`}><Shield size={20} /><span>Bảo Hộ Miễn Trừ</span></button>
          </div>
        </div>
      )}
      <div className="p-3"><PSubmitButton isEnabled={!isPingDisabled} onSubmit={handlePing} /></div>
      {activePower && (
        <div className="mx-3 mt-2 p-3 bg-blue-800 border-2 border-blue-400 rounded-xl flex items-center gap-3">
          {activePower === 'star' ? (<><Star size={20} className="text-yellow-400 shrink-0" /><span className="font-bold text-yellow-300">Ngôi sao hy vọng</span><span className="text-yellow-200 text-sm">Đúng: +150% · Sai: -100%</span></>) : (<><Shield size={20} className="text-blue-400 shrink-0" /><span className="font-bold text-blue-300">Bảo hộ miễn trừ</span><span className="text-blue-200 text-sm">Đúng: +50% · Sai: không trừ</span></>)}
        </div>
      )}
    </PBasePageLayout>
  );
};

// ─── MC View ────────────────────────────────────────────────────────────────
const MCVeDichRiengView = () => { const { matchCode } = useRoleSession("mc"); return <VeDichAudiencePage variant="rieng" Layout={PBasePageLayout} matchCode={matchCode} />; };

// ─── Main Page ──────────────────────────────────────────────────────────────
const VeDichRiengPage = () => { const { role } = useGameWebSocket(); if (role === "admin") return <AdminVeDichRiengView />; if (role === "mc") return <MCVeDichRiengView />; return <PlayerVeDichRiengView />; };
export default VeDichRiengPage;

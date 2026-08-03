

import { useCallback, useEffect, useRef, useState } from "react";
import { submitAnswer } from "@/api/answers";
import { Star, Shield } from "lucide-react";

import PQuestionBoard from "@/components/player/PQuestionBoard";
import PAnswerBox from "@/components/player/PAnswerBox";
import { PBasePageLayout } from "@/pages/player/PBasePageLayout";
import VeDichQuestionCard from "@/components/shared/VeDichQuestionCard";
import { useCountdownTimer } from "@/hooks/useCountdownTimer";
import { useRoleSession } from "@/hooks/useRoleSession";
import { useQuestionState } from "@/hooks/useQuestionState";
import { useGameWebSocket } from "@/hooks/useGameWebSocket";
import { useAudiencePlayers } from "@/hooks/useAudiencePlayers";

const PVeDichChungPage = () => {
	const { matchCode, playerCode, token } = useRoleSession("player");
	const { isConnected, lastMessage, sendMessage } = useGameWebSocket();
	const { timer, timeLimit, startSynced, getElapsedSeconds } = useCountdownTimer();
	const { currentQuestion, applyWsMessage } = useQuestionState();
	const [videoPlayState, setVideoPlayState] = useState<"playing" | "paused" | null>(null);

	type RoundQuestion = { code: string; category: string; points: number };
	const [roundQuestionsData, setRoundQuestionsData] = useState<RoundQuestion[]>(() => {
		if (!matchCode) return [];
		try {
			const stored = localStorage.getItem(`vd_chung_meta_${matchCode}`);
			return stored ? (JSON.parse(stored) as RoundQuestion[]) : [];
		} catch { return []; }
	});
	const [questionStates, setQuestionStates] = useState<Record<string, "answered" | "answered-wrong" | "available">>({});

	const { players, setPlayers, applyPlayersInfo, applyScoreUpdate } = useAudiencePlayers();
	const [answer, setAnswer] = useState("");
	const [showAnswers, setShowAnswers] = useState(false);

	const [usedPowers, setUsedPowers] = useState<Record<string, string | null>>(() => {
		if (!matchCode) return {};
		try {
			const stored = localStorage.getItem(`vd_powers_${matchCode}`);
			return stored ? JSON.parse(stored) : {};
		} catch { return {}; }
	});
	const [powerWindowOpen, setPowerWindowOpen] = useState(false);
	const [powerWindowCountdown, setPowerWindowCountdown] = useState(0);
	const [selectedPower, setSelectedPower] = useState<"star" | "shield" | null>(null);
	const powerWindowTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

	useEffect(() => {
		if (!matchCode || !isConnected) return;
		if (roundQuestionsData.length === 0) {

			sendMessage({ type: "vd_questions_meta_request", match_code: matchCode });
		}
	}, [matchCode, isConnected, roundQuestionsData.length, sendMessage]);

	useEffect(() => {
		if (!lastMessage) return;
		const msg = lastMessage.message ?? lastMessage;

		queueMicrotask(() => {

		console.info("PLAYER lastMessage:", lastMessage);
		console.info("PLAYER msg:", msg);

		applyWsMessage(msg);
		if (msg?.type === "send_question" || msg?.type === "clear_question") setVideoPlayState(null);

		switch (msg?.type) {
			case "send_players_info":
				applyPlayersInfo(msg);
				break;

			case "start_the_timer": {
				startSynced(Number(msg.time_limit ?? 0), Number(msg.started_at ?? Date.now()));
				setAnswer("");
				setShowAnswers(false);
				break;
			}

			case "play_video":
				setVideoPlayState("playing");
				break;

			case "pause_video":
				setVideoPlayState("paused");
				break;

			case "player_score_updated":
				applyScoreUpdate(msg);
				break;

			case "clear_answers": {
				setPlayers((prev) =>
					prev.map((p) => ({
						...p,
						playerLastAnswer: undefined,
						playerTimestamp: undefined,
						playerHasBuzzed: undefined,
					})),
				);
				setAnswer("");
				setShowAnswers(false);
				break;
			}

			case "send_answers_to_players": {
				const answers = msg.answers ?? [];
				setPlayers((prev) =>
					prev.map((p) => {
						const ans = answers.find((a) => String(a.user_code) === p.playerCode);
						if (!ans) return p;
						return {
							...p,
							playerLastAnswer: ans.content,
							playerTimestamp: ans.timestamp || p.playerTimestamp,
						};
					}),
				);
				setShowAnswers(true);
				break;
			}

			case "vdc_question_state": {
				const { question_code, state: qState } = msg;
				if (question_code && qState) {
					setQuestionStates((prev) => ({ ...prev, [question_code]: qState as "answered" | "answered-wrong" | "available" }));
				}
				break;
			}

			case "vd_questions_selected":
			case "vdc_questions_meta": {
				const metadata: RoundQuestion[] = msg.question_metadata ?? [];
				if (metadata.length > 0) {
					setRoundQuestionsData(metadata);
					try { localStorage.setItem(`vd_chung_meta_${matchCode}`, JSON.stringify(metadata)); } catch (error) { console.error("Storage update failed", error); }
				}
				break;
			}

			case "vd_power_window_open": {
				const eligible = msg.eligible_user_codes;
				if (Array.isArray(eligible) && eligible.length > 0 && !eligible.includes(playerCode ?? "")) {
					console.info("[VDC] Ignoring vd_power_window_open: not in eligible_user_codes", { eligible, me: playerCode });
					break;
				}
				const duration = Number(msg.duration ?? 5);
				setPowerWindowOpen(true);
				setPowerWindowCountdown(duration);
				setSelectedPower(null);
				break;
			}

			case "vd_player_power": {
				const { user_code, power } = msg;
				if (user_code && (power === "star" || power === "shield")) {

					setUsedPowers((prev) => {
						const next = { ...prev, [user_code]: power };

						try { localStorage.setItem(`vd_powers_${matchCode}`, JSON.stringify(next)); } catch (error) { console.error("Storage update failed", error); }
						return next;
					});

					setPlayers((prev) =>
						prev.map((p) =>
							p.playerCode === user_code ? { ...p, playerPower: power as "star" | "shield" } : p,
						),
					);
				}
				break;
			}

			case "vd_powers_used": {

				if (msg.used_powers) {
					const powers = msg.used_powers;
					setUsedPowers(powers);
					try { localStorage.setItem(`vd_powers_${matchCode}`, JSON.stringify(powers)); } catch (error) { console.error("Storage update failed", error); }

					setPlayers((prev) =>
						prev.map((p) => {
							const power = powers[p.playerCode];
							return power ? { ...p, playerPower: power as "star" | "shield" } : p;
						}),
					);
				}
				break;
			}

			default:
				break;
		}
		});
	}, [applyPlayersInfo, applyScoreUpdate, applyWsMessage, lastMessage, matchCode, playerCode, setPlayers, startSynced, usedPowers]);

	useEffect(() => {
		if (!powerWindowOpen || powerWindowCountdown <= 0) return;
		powerWindowTimerRef.current = window.setInterval(() => {
			setPowerWindowCountdown((prev) => {
				if (prev <= 1) {
					setPowerWindowOpen(false);

					void sendMessage({ type: "vd_power_window_closed", user_code: playerCode });
					return 0;
				}
				return prev - 1;
			});
		}, 1000);
		return () => {
			if (powerWindowTimerRef.current) window.clearInterval(powerWindowTimerRef.current);
		};
	}, [powerWindowOpen, powerWindowCountdown, playerCode, sendMessage]);

	const handleSelectPower = useCallback(async (power: "star" | "shield") => {
		if (!powerWindowOpen || usedPowers[playerCode]) return;
		setSelectedPower(power);
		setPowerWindowOpen(false);
		try {
			await sendMessage({
				type: "vd_player_power",
				user_code: playerCode,
				power,
			});
		} catch (err) {
			console.warn("Failed to send power selection:", err);
		}
	}, [powerWindowOpen, usedPowers, playerCode, sendMessage]);

	useEffect(() => {
		return () => {
			if (powerWindowTimerRef.current) window.clearInterval(powerWindowTimerRef.current);
		};
	}, []);

	const handleSubmitAnswer = useCallback(async () => {
		const trimmed = answer.trim();
		if (!trimmed) return;
		if (!isConnected) return;
		if (timer <= 0) return;
		if (!currentQuestion.questionCode) return;

		const elapsed = getElapsedSeconds();
		const ts = Math.max(0, Math.min(timeLimit, elapsed));

		setPlayers((prev) =>
			prev.map((p) =>
				p.playerCode === playerCode
					? { ...p, playerLastAnswer: trimmed, playerTimestamp: Number(ts.toFixed(3)) }
					: p,
			),
		);

		try {
			await submitAnswer({
				user_code: playerCode,
				match_code: matchCode,
				question_code: currentQuestion.questionCode,
				answer_text: trimmed,
				has_buzzed: false,
				timestamp: ts,
			}, token);
		} catch (error) {
			console.warn("Failed to submit answer:", error);
		}

		await sendMessage({
			type: "player_answer",
			user_code: playerCode,
			question_code: currentQuestion.questionCode,
			answer_text: trimmed,
			timestamp: ts,
		});
		setAnswer("");
	}, [answer, currentQuestion.questionCode, getElapsedSeconds, isConnected, matchCode, playerCode, sendMessage, setPlayers, timeLimit, timer, token]);

	const isSubmissionDisabled = !isConnected || timer <= 0;

	const currentPoints = (() => {
		if (!currentQuestion.questionCode) return 0;
		const q = roundQuestionsData.find((r) => r.code === currentQuestion.questionCode);
		return q?.points ?? 0;
	})();

	const displayPlayers = players.map((p) =>
		showAnswers || p.playerCode === playerCode ? p : { ...p, playerLastAnswer: undefined, playerTimestamp: undefined },
	);

	return (
		<PBasePageLayout
			players={displayPlayers}
			currentPlayerCode={playerCode}
		>
			<>
				<PQuestionBoard
					title="VỀ ĐÍCH - LƯỢT CHUNG"
					question={currentQuestion}
					timerDuration={timer}
					videoPlayState={videoPlayState}
				>
					<div className="flex gap-1 overflow-x-auto">
						{roundQuestionsData.length > 0
						? roundQuestionsData.map((q) => {
							const qState = questionStates[q.code] ?? "available";
							const isActive = currentQuestion.questionCode === q.code;
							return (
								<div key={q.code} className="w-32 sm:w-40 lg:w-55 shrink-0 h-16 sm:h-18 lg:h-20">
								<VeDichQuestionCard
									category={q.category}
									points={q.points}
									state={qState}
									isSelected={isActive}
									disabled={qState !== "available"}
								/>
							</div>
							);
						})
							: Array.from({ length: players.length || 4 }).map((_, i) => (
								<div key={`ph-${i}`} className="w-32 sm:w-40 lg:w-55 shrink-0 h-16 sm:h-18 lg:h-20">
									<VeDichQuestionCard placeholder category="" disabled />
								</div>
							))}
					</div>
				</PQuestionBoard>

				<PAnswerBox
					answer={answer}
					setAnswer={setAnswer}
					isDisabled={isSubmissionDisabled}
					onSubmit={handleSubmitAnswer}
					placeholderString={timer <= 0 ? "Bạn không thể nhập đáp án tại thời điểm này" : "Nhập đáp án và nhấn Enter"}
				/>

				{}
				{powerWindowOpen && !usedPowers[playerCode] && (
					<div className="bg-blue-900 border-2 border-blue-400 rounded-xl p-4 flex flex-col items-center gap-3">
						<p className="text-white font-bold text-lg">Chọn quyền năng ({powerWindowCountdown}s)</p>
						<div className="flex gap-4">
							<button
								onClick={() => { void handleSelectPower('star'); }}
							disabled={currentPoints === 20}
							className={`flex items-center gap-2 px-4 py-3 rounded-xl font-bold transition-all duration-150 ${
								selectedPower === 'star'
									? 'bg-white-500 text-blue-900 ring-2 ring-white-300'
									: 'bg-white-500/20 text-white-300 border-2 border-white-500/50 hover:bg-white-500/40'
							} ${currentPoints === 20 ? 'opacity-40 cursor-not-allowed' : ''}`}
						>
							<Star size={20} />
							<span>Ngôi Sao Hy Vọng</span>
						</button>
						<button
							onClick={() => { void handleSelectPower('shield'); }}
							disabled={currentPoints === 50}
								className={`flex items-center gap-2 px-4 py-3 rounded-xl font-bold transition-all duration-150 ${
									selectedPower === 'shield'
										? 'bg-blue-500 text-blue-900 ring-2 ring-blue-300'
										: 'bg-blue-500/20 text-blue-300 border-2 border-blue-500/50 hover:bg-blue-500/40'
							} ${currentPoints === 50 ? 'opacity-40 cursor-not-allowed' : ''}`}
							>
								<Shield size={20} />
								<span>Bảo Hộ Miễn Trừ</span>
							</button>
						</div>
						<p className="text-blue-300 text-sm">Chỉ được dùng 1 lần xuyên suốt VĐC & VĐR</p>
					</div>
				)}

				{}
				{!powerWindowOpen && usedPowers[playerCode] && (
					<div className="bg-blue-900/60 border-2 border-blue-400 rounded-xl p-3 flex items-center gap-2 font-bold text-sm text-blue-100">
						{usedPowers[playerCode] === 'star' ? <Star size={18} className="shrink-0" /> : <Shield size={18} className="shrink-0" />}
						<span>
							Bạn đã dùng Quyền năng {usedPowers[playerCode] === 'star' ? 'Ngôi Sao Hy Vọng' : 'Bảo Hộ Miễn Trừ'}.
							Bạn KHÔNG THỂ sử dụng Quyền năng trong phần còn lại của vòng thi.
						</span>
					</div>
				)}

			</>
		</PBasePageLayout>
	);
};

export default PVeDichChungPage;

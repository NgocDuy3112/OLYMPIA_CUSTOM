/* eslint-disable no-empty */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { startTransition, useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { CheckCircle, RotateCcw, Play, RefreshCw } from "lucide-react";
import AVeDichPickLayout from "@/pages/admin/AVeDichPickLayout";
import APlayerBar from "@/components/admin/APlayerBar";
import AControlButton from "@/components/admin/AControlButton";
import { useAdminWebSocket } from "@/hooks/useAdminWebSocket";
import { createLogger } from "@/utils/logger";
import { buildPlayersSnapshot } from "@/utils/playerHelpers";
import { compareVeDichCodes, generateVeDichPlaceholderCodes, getVeDichMeta } from "@/utils/veDichGrid";
import { VeDichRound, getVeDichRoundLabel } from "@/types/veDich";
import type { PlayerStatus } from "@/types/player";
import type { Question } from "@/types/question";
import { API_BASE_URL } from "@/configs";

const logger = createLogger("AVeDichPick");

/**
 * VỀ ĐÍCH Round Question Picker
 *
 * Handles both:
 * - /admin/vdc/pick/:matchCode → Lượt Chung (4 questions)
 * - /admin/vdr/pick/:matchCode → Lượt CÁ NHÂN (3 questions)
 */

const AVeDichPickQuestion = () => {
	const { matchCode: paramMatchCode } = useParams<{ matchCode: string }>();
	const currentMatchCode = localStorage.getItem("matchCode") || paramMatchCode || "";
	const token = localStorage.getItem("jwtToken_admin") ?? "";
	const { lastMessage, sendMessage } = useAdminWebSocket();
	const navigate = useNavigate();

	// Redirect to game managing page if no match code is available
	useEffect(() => {
		if (!currentMatchCode) {
			navigate("/admin/manage");
		}
	}, [currentMatchCode, navigate]);

	// Determine round type from current path
	const currentPath = window.location.pathname;
	const isChung = currentPath.includes("/vdc/pick") && !currentPath.includes("/vdr/");
	const round = isChung ? VeDichRound.CHUNG : VeDichRound.RIENG;
	const roundTitle = getVeDichRoundLabel(round);

	// State
	const [players, setPlayers] = useState<PlayerStatus[]>([]);
	// Selected player for CÁ NHÂN round (admin click)
	const [selectedPlayerCode, setSelectedPlayerCode] = useState<string | null>(null);
	const [questions, setQuestions] = useState<Question[]>([]);
	const [usedQuestionCodes, setUsedQuestionCodes] = useState<string[]>([]);
	const [selectedQuestionCodes, setSelectedQuestionCodes] = useState<string[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [errorMessage, setErrorMessage] = useState<string>("");
	const [successMessage, setSuccessMessage] = useState<string>("");

	// Placeholder questions for instant grid rendering (before API fetch completes)
	const [placeholderQuestions, setPlaceholderQuestions] = useState<Question[]>([]);

	// Chung: questions = player count; CÁ NHÂN: fixed 3 questions
	const requiredCount = isChung ? players.length : round;

	const questionCategories = questions.map((q, idx) => getVeDichMeta(q.questionCode, idx).category);
	const questionPoints     = questions.map((q, idx) => getVeDichMeta(q.questionCode, idx).points);

	// Track selected question codes
	const toggleQuestionSelection = useCallback((questionCode: string) => {
		// For CÁ NHÂN round: must select a player first before selecting questions
		if (!isChung && !selectedPlayerCode) {
			setErrorMessage("Vui lòng chọn thí sinh tham gia lượt thi trước");
			return;
		}

		setSelectedQuestionCodes((prev) => {
			const isSelected = prev.includes(questionCode);
			if (isSelected) {
				return prev.filter((code) => code !== questionCode);
			} else {
				// Only allow selecting up to requiredCount (= number of players)
				if (prev.length < requiredCount) {
					return [...prev, questionCode];
				}
				return prev;
			}
		});
	}, [requiredCount, isChung, selectedPlayerCode]);

	// Broadcast live selection updates so players can see highlighted questions in real-time
	// Also sends all_question_codes so the player pick page can build the grid without API access
	// Persists to localStorage so player pick page can restore state even if they arrive after this fires
	useEffect(() => {
		if (!currentMatchCode) return;
		const allCodes = questions.map((q) => q.questionCode);
		sendMessage({
			type: "vd_selection_update",
			match_code: currentMatchCode,
			round: isChung ? "chung" : "rieng",
			selected_question_codes: selectedQuestionCodes,
			all_question_codes: allCodes,
			used_question_codes: usedQuestionCodes,
		});
		// Persist so player pick page can restore on mount (race-condition fix)
		if (allCodes.length > 0) {
			localStorage.setItem(`veDich_pick_all_codes_${currentMatchCode}`, JSON.stringify(allCodes));
		}
		if (selectedQuestionCodes.length > 0) {
			localStorage.setItem(`veDich_pick_selected_${currentMatchCode}`, JSON.stringify(selectedQuestionCodes));
		} else {
			localStorage.removeItem(`veDich_pick_selected_${currentMatchCode}`);
		}
	}, [selectedQuestionCodes, questions, currentMatchCode, isChung, sendMessage]);

	// Broadcast selected player (blocked buzzer) for CÁ NHÂN
	useEffect(() => {
		if (!currentMatchCode) return;
		if (isChung) return; // only for CÁ NHÂN
		// send blocked_buzz message (user_code null clears)
		sendMessage({ type: "blocked_buzz", user_code: selectedPlayerCode ?? null, match_code: currentMatchCode });
		// persist selection
		try {
			localStorage.setItem(`veDich_rieng_selected_player_${currentMatchCode}`, selectedPlayerCode ?? "");
		} catch { /* ignore */ }
	}, [selectedPlayerCode, currentMatchCode, isChung, sendMessage]);

	// Toggle selected player (single select)
	const toggleSelectedPlayer = useCallback((playerCode: string) => {
		setSelectedPlayerCode((prev) => (prev === playerCode ? null : playerCode));
	}, []);

	// Fetch initial players state from backend
	const loadPlayersState = useCallback(async () => {
		if (!currentMatchCode || !token) return;
		try {
			const playersRes = await fetch(`${API_BASE_URL}/matches/${currentMatchCode}/players`, {
				headers: { Authorization: `Bearer ${token}` },
			});
			const playersJson = await playersRes.json();
			const playersList = playersJson.data?.players ?? [];

			let scoreList: any[] = [];
			try {
				const scoreRes = await fetch(`${API_BASE_URL}/scoreboard/${currentMatchCode}`, {
					headers: { Authorization: `Bearer ${token}` },
				});
				const scoreJson = await scoreRes.json();
				scoreList = scoreJson.data?.scoreboard ?? [];
			} catch (err) {
				logger.error("Failed to load scoreboard:", err);
			}

			const profileResponses = await Promise.all(
				playersList.map((entry: any) =>
					fetch(`${API_BASE_URL}/users/?user_code=${entry.user_code}`, {
						headers: { Authorization: `Bearer ${token}` },
					})
						.then((res) => res.json())
						.catch(() => null),
				),
			);
			const profiles = playersList.map((entry: any, index: number) => ({
				user_code: entry.user_code,
				user_name: profileResponses[index]?.data?.user_name ?? "",
			}));

			setPlayers((prev) => buildPlayersSnapshot(playersList, scoreList, profiles, prev));

			// Broadcast player info to player clients so PVeDichPickPage can render PPlayerRec
			const mergedPlayers = playersList.map((p: any) => {
				const userCode = String(p?.user_code ?? "");
				const profile = profiles.find((pr: any) => String(pr?.user_code) === userCode) ?? {};
				const scoreEntry = scoreList.find((s: any) => String(s?.user_code) === userCode) ?? {};
				return {
					user_code: userCode,
					user_name: (profile as any)?.user_name ?? p?.user_name ?? (scoreEntry as any)?.user_name ?? "",
					cumulative_score: (scoreEntry as any)?.cumulative_score ?? (scoreEntry as any)?.cumulative_score ?? (scoreEntry as any)?.total_score ?? 0,
				};
			});
			sendMessage({ type: "send_players_info", players: mergedPlayers });
		} catch (err) {
			logger.error("Failed to load players:", err);
		}
	}, [currentMatchCode, token, sendMessage]);

	const handleEditScore = useCallback((playerCode: string, newScore: number) => {
		setPlayers((prev) =>
			prev.map((p) =>
				p.playerCode === playerCode ? { ...p, playerScore: newScore } : p
			)
		);
		void loadPlayersState();
	}, [loadPlayersState]);

	useEffect(() => {
		loadPlayersState();
	}, [loadPlayersState]);

	// Restore selected player if present
	useEffect(() => {
		if (!currentMatchCode) return;
		try {
			const stored = localStorage.getItem(`veDich_rieng_selected_player_${currentMatchCode}`);
			if (stored) setSelectedPlayerCode(stored || null);
		} catch { /* ignore */ }
	}, [currentMatchCode]);

	// Generate placeholder questions immediately for instant grid rendering
	useEffect(() => {
		const allPlaceholderCodes = generateVeDichPlaceholderCodes();
		const placeholders: Question[] = allPlaceholderCodes.map((code) => ({
			questionCode: code,
			questionText: "",
			questionAnswer: "",
			questionExplanation: "",
			questionMediaURL: undefined,
		}));
		setPlaceholderQuestions(placeholders);

		// Broadcast placeholder codes immediately so MC/Player can render grid
		if (currentMatchCode) {
			sendMessage({
				type: "vd_selection_update",
				match_code: currentMatchCode,
				round: isChung ? "chung" : "rieng",
				selected_question_codes: [],
				all_question_codes: allPlaceholderCodes,
				used_question_codes: [],
			});
			// Persist to localStorage
			try {
				localStorage.setItem(`veDich_pick_all_codes_${currentMatchCode}`, JSON.stringify(allPlaceholderCodes));
			} catch { /* ignore */ }
		}
	}, [currentMatchCode, isChung, sendMessage]);

	// Fetch questions from backend
	useEffect(() => {
		const fetchQuestions = async () => {
			if (!currentMatchCode || !token) {
				setErrorMessage("Match code or token missing");
				setIsLoading(false);
				return;
			}

			try {
				setIsLoading(true);
				setErrorMessage("");

				const url = `${API_BASE_URL}/questions/?match_code=${encodeURIComponent(currentMatchCode)}`;
				const response = await fetch(url, {
					headers: { Authorization: `Bearer ${token}` },
				});

				if (!response.ok) {
					throw new Error(`Failed to fetch questions: ${response.status}`);
				}

				const result = await response.json();
				const rawQuestions = Array.isArray(result.data) ? result.data : [result.data].filter(Boolean);

				// Filter for VỀ ĐÍCH questions by question_code prefix (API returns snake_case)
				const veDichRaw = rawQuestions.filter((q: { question_code?: string }) =>
					q.question_code?.includes("_VD_") || q.question_code?.startsWith("OC3_Q_VD")
				);

				// Map raw API response (snake_case) to Question type (camelCase)
				const mapped: Question[] = veDichRaw.map((q: {
					question_code: string;
					content: string;
					answer: string;
					explanation?: string;
					media_url?: string;
					is_used?: boolean;
				}) => ({
					questionCode: q.question_code,
					questionText: q.content,
					questionAnswer: q.answer,
					questionExplanation: q.explanation ?? "",
					questionMediaURL: q.media_url ?? undefined,
				}));

				// Track which questions are already used (disabled from selection)
				const used = veDichRaw
					.filter((q: { is_used?: boolean }) => q.is_used === true)
					.map((q: { question_code: string }) => q.question_code);

				// Also treat questions already answered in ANY VỀ ĐÍCH round as used.
				// Unified key written by both AVeDichChungPage and future CÁ NHÂN page.
				try {
					const storedUsed = localStorage.getItem(`veDich_used_codes_${currentMatchCode}`);
					if (storedUsed) {
						const usedCodes = JSON.parse(storedUsed) as string[];
						setUsedQuestionCodes([...new Set([...used, ...usedCodes])]);
					} else {
						// Fallback: also check per-round chung states for backward compat
						const storedChungStates = localStorage.getItem(`veDich_chung_states_${currentMatchCode}`);
						if (storedChungStates) {
							const statesMap = JSON.parse(storedChungStates) as Record<string, string>;
							const answeredCodes = Object.entries(statesMap)
								.filter(([, v]) => v === "answered")
								.map(([k]) => k);
							setUsedQuestionCodes([...new Set([...used, ...answeredCodes])]);
						} else {
							setUsedQuestionCodes(used);
						}
					}
				} catch {
					setUsedQuestionCodes(used);
				}

				// Sort by question_code for consistent ordering
				mapped.sort((a, b) => compareVeDichCodes(a.questionCode, b.questionCode));

				// Guard against duplicate question_codes (e.g. double import)
				const deduped = mapped.filter((q, i, arr) =>
					arr.findIndex((q2) => q2.questionCode === q.questionCode) === i,
				);

				if (deduped.length === 0) {
					setErrorMessage("Không tìm thấy câu hỏi Về Đích cho trận đấu này");
				}

				setQuestions(deduped);

				// Persist all question codes to localStorage immediately so MC/Player can restore on mount
				// This fixes the race condition where admin clicks "Bắt đầu" before questions are loaded
				const allCodes = deduped.map((q) => q.questionCode);
				if (currentMatchCode && allCodes.length > 0) {
					try {
						localStorage.setItem(`veDich_pick_all_codes_${currentMatchCode}`, JSON.stringify(allCodes));
					} catch (err) {
						logger.error("Failed to persist question codes to localStorage:", err);
					}
				}

				// Broadcast immediately so MC/Player pages render the grid without waiting for "Bắt đầu"
				sendMessage({
					type: "vd_selection_update",
					match_code: currentMatchCode,
					round: isChung ? "chung" : "rieng",
					selected_question_codes: [],
					all_question_codes: allCodes,
					used_question_codes: usedQuestionCodes,
				});
			} catch (err) {
				logger.error("Failed to fetch questions:", err);
				setErrorMessage("Lỗi khi tải câu hỏi");
			} finally {
				setIsLoading(false);
			}
		};

		fetchQuestions();
	}, [currentMatchCode, token]);

	// Listen to WebSocket updates for player changes
	useEffect(() => {
		if (!lastMessage) return;

		startTransition(() => {
			// buildPlayersSnapshot expects (playersList, scoreList, profiles, prevPlayers)
			// For VỀ ĐÍCH, we just use the snapshot as-is
			if (Array.isArray(lastMessage)) {
				const snapshot = buildPlayersSnapshot(lastMessage, [], [], players);
				setPlayers(snapshot);
			}
		});
	}, [lastMessage, players]);

	// Handle sending selected questions to backend
	const handleConfirmSelection = useCallback(async () => {
		if (requiredCount === 0) {
			setErrorMessage("Chưa tải được danh sách thí sinh");
			return;
		}
		// For CÁ NHÂN: must have a player selected
		if (!isChung && !selectedPlayerCode) {
			setErrorMessage("Vui lòng chọn thí sinh tham gia lượt thi trước");
			return;
		}
		if (selectedQuestionCodes.length !== requiredCount) {
			setErrorMessage(`Vui lòng chọn đủ ${requiredCount} câu hỏi`);
			return;
		}

		try {
			setErrorMessage("");
			setSuccessMessage("");

			// Mark selected questions as used — persist to localStorage so the pick page
			// shows them disabled when the admin navigates back from the gameplay page.
			setUsedQuestionCodes((prev) => [...new Set([...prev, ...selectedQuestionCodes])]);
			if (currentMatchCode) {
				try {
					const existing = JSON.parse(
						localStorage.getItem(`veDich_used_codes_${currentMatchCode}`) ?? "[]"
					) as string[];
					localStorage.setItem(
						`veDich_used_codes_${currentMatchCode}`,
						JSON.stringify([...new Set([...existing, ...selectedQuestionCodes])]),
					);
				} catch { /* ignore */ }
			}

			// Notify players via WebSocket
			const allCodes = questions.map((q) => q.questionCode);
			const payload = {
				type: "vd_questions_selected",
				match_code: currentMatchCode,
				round: isChung ? "chung" : "rieng",
				selected_question_codes: selectedQuestionCodes,
				all_question_codes: allCodes,
				question_metadata: selectedQuestionCodes.map((code) => {
					const idx = allCodes.findIndex((c) => c === code);
					return {
						code,
						category: questionCategories[idx] ?? `Category ${Math.floor(idx / 4) + 1}`,
						points: questionPoints[idx] ?? 0,
					};
				}),
				timestamp: Date.now(),
			};
			if (!isChung) {
				(payload as any).selected_player_code = selectedPlayerCode ?? null;
			}
			sendMessage(payload);
			// Navigate players to the gameplay page
			const playerPath = isChung ? "/player/vdc" : "/player/vdr";
			sendMessage({ type: "navigate", user_code: "", path: playerPath });
			// Persist selected codes so the gameplay page can restore them
			if (currentMatchCode) {
				const codesKey = isChung
					? `veDich_chung_codes_${currentMatchCode}`
					: `veDich_rieng_codes_${currentMatchCode}`;
				localStorage.setItem(codesKey, JSON.stringify(selectedQuestionCodes));
				if (!isChung) {
					const selKey = `veDich_rieng_selected_player_${currentMatchCode}`;
					localStorage.setItem(selKey, selectedPlayerCode ?? "");
				}
			}
			setSuccessMessage(`Đã chọn ${requiredCount} câu hỏi. Chuyển đến vòng thi...`);

			// Navigate to the gameplay page after brief feedback
			setTimeout(() => {
				const dest = isChung
					? `/admin/vdc/${currentMatchCode}`
					: `/admin/vdr/${currentMatchCode}`;
				navigate(dest);
			}, 1500);
		} catch (err) {
			logger.error("Failed to confirm selection:", err);
			setErrorMessage("Lỗi khi xác nhận câu hỏi");
		}
	}, [selectedQuestionCodes, questions, requiredCount, currentMatchCode, isChung, sendMessage, navigate, selectedPlayerCode, questionCategories, questionPoints]);

	const handleResetSelection = useCallback(() => {
		setSelectedQuestionCodes([]);
		setErrorMessage("");
		setSuccessMessage("");
	}, []);

	// Reset used questions so every question becomes selectable again
	const handleResetUsedQuestions = useCallback(() => {
		if (!currentMatchCode) return;
		try {
			// Clear in-memory state
			setUsedQuestionCodes([]);

			// Remove persisted keys that mark questions as used
			try {
				localStorage.removeItem(`veDich_used_codes_${currentMatchCode}`);
			} catch {}
			try {
				localStorage.removeItem(`veDich_chung_codes_${currentMatchCode}`);
			} catch {}
			try {
				localStorage.removeItem(`veDich_rieng_codes_${currentMatchCode}`);
			} catch {}

			// Inform players so their UI can refresh if needed.
			// silent: true — this is a data-only refresh, no SFX should play.
			sendMessage({
				type: "vd_selection_update",
				match_code: currentMatchCode,
				round: isChung ? "chung" : "rieng",
				selected_question_codes: selectedQuestionCodes,
				all_question_codes: questions.map((q) => q.questionCode),
				silent: true,
			});

			setSuccessMessage("Đã reset trạng thái câu hỏi — tất cả câu có thể chọn lại");
		} catch (err) {
			logger.error("Failed to reset used questions:", err);
			setErrorMessage("Không thể reset câu hỏi");
		}
	}, [currentMatchCode, questions, selectedQuestionCodes, isChung, sendMessage]);

	// Start Về Đích round: re-broadcast grid data for late-joining players,
	// then navigate them to the pick page and announce round_start so the
	// SFX bot plays vd_bat_dau.ogg. The vd_selection_update broadcast is
	// data-only (silent: true) so we don't double up audio with round_start.
	const handleStartRound = useCallback(() => {
		// Use real questions if loaded, otherwise fall back to placeholders
		const allCodes = questions.length > 0
			? questions.map((q) => q.questionCode)
			: placeholderQuestions.map((q) => q.questionCode);

		// Fix 2: Merge used_question_codes from localStorage (cross-round persistence)
		// so player/MC pages see the full set of used questions immediately on mount,
		// even if our in-memory usedQuestionCodes state hasn't been populated yet.
		let mergedUsed = [...usedQuestionCodes];
		try {
			const storedUsed = localStorage.getItem(`veDich_used_codes_${currentMatchCode}`);
			if (storedUsed) {
				const usedCodes = JSON.parse(storedUsed) as string[];
				mergedUsed = [...new Set([...mergedUsed, ...usedCodes])];
				// Also sync our in-memory state for consistency
				setUsedQuestionCodes(mergedUsed);
			}
		} catch { /* ignore */ }

		// Re-broadcast grid data so PVeDichPickPage has question codes when it mounts
		sendMessage({
			type: "vd_selection_update",
			match_code: currentMatchCode,
			round: isChung ? "chung" : "rieng",
			selected_question_codes: selectedQuestionCodes,
			all_question_codes: allCodes,
			used_question_codes: mergedUsed,
			silent: true,
		});
		// Persist to localStorage as backup so PVeDichPickPage can hydrate on mount
		// even if it misses the WS message (Fix 1 backup path).
		if (currentMatchCode && allCodes.length > 0) {
			localStorage.setItem(`veDich_pick_all_codes_${currentMatchCode}`, JSON.stringify(allCodes));
		}
		if (currentMatchCode) {
			try {
				localStorage.setItem(
					`veDich_used_codes_${currentMatchCode}`,
					JSON.stringify(mergedUsed),
				);
			} catch { /* ignore */ }
		}
		// Navigate players to the pick page
		const pickPath = isChung ? "/player/vdc/pick" : "/player/vdr/pick";
		sendMessage({ type: "navigate", user_code: "", path: pickPath });
		// Announce round start so SFX bot plays vd_bat_dau.ogg
		sendMessage({ type: "round_start", round: isChung ? "vdc" : "vdr" });
		// Re-broadcast player info so PVeDichPickPage has player data on mount
		void loadPlayersState();
	}, [currentMatchCode, questions, placeholderQuestions, usedQuestionCodes, selectedQuestionCodes, isChung, sendMessage, loadPlayersState]);

	const topControlButtons = (
		<>
			<AControlButton
				onClick={handleStartRound}
				disabled={isLoading && questions.length === 0}
			>
				<Play size={18} />
				<span className="ml-2 font-bold">BẮT ĐẦU</span>
			</AControlButton>

			<AControlButton
				onClick={handleConfirmSelection}
				disabled={selectedQuestionCodes.length !== requiredCount || requiredCount === 0 || isLoading}
			>
				<CheckCircle size={20} />
				<span className="ml-2 font-bold">XÁC NHẬN</span>
			</AControlButton>

			<AControlButton
				onClick={handleResetSelection}
			>
				<RotateCcw size={20} />
				<span className="ml-2 font-bold">CHỌN LẠI</span>
			</AControlButton>

			<AControlButton
				onClick={handleResetUsedQuestions}
			>
				<RefreshCw size={18} />
				<span className="ml-2 font-bold">RESET</span>
			</AControlButton>
		</>
	);

	const bottomActionButtons = (
		<>
			{isLoading && questions.length === 0 && <p className="text-blue-600 font-semibold">Đang tải câu hỏi...</p>}
			{questions.length > 0 && <p className="text-green-600 font-semibold">✓ Đã tải {questions.length} câu hỏi</p>}
		</>
	);

	const statusMessages = (
		<>
			{errorMessage && <div className="text-blue-600 font-semibold text-center">{errorMessage}</div>}
			{successMessage && <div className="text-blue-600 font-semibold text-center">{successMessage}</div>}
		</>
	);

	return (
		<AVeDichPickLayout
			title={roundTitle}
			maxQuestions={requiredCount}
			questions={questions.length > 0 ? questions : placeholderQuestions}
			categories={questionCategories.length > 0 ? questionCategories : placeholderQuestions.map((q, idx) => getVeDichMeta(q.questionCode, idx).category)}
			points={questionPoints.length > 0 ? questionPoints : placeholderQuestions.map((q, idx) => getVeDichMeta(q.questionCode, idx).points)}
			selectedQuestionCodes={selectedQuestionCodes}
			onQuestionSelect={toggleQuestionSelection}
			disabledQuestionCodes={usedQuestionCodes}
			canSelectQuestions={!isChung ? !!selectedPlayerCode : true}
			topControlButtons={topControlButtons}
			bottomActionButtons={bottomActionButtons}
			statusMessages={statusMessages}
			renderPlayerList={() =>
				players.map((player) => (
					<APlayerBar
						key={player.playerCode}
						player={player}
						isActive={selectedPlayerCode === player.playerCode}
						isCurrent={!isChung && selectedPlayerCode === player.playerCode}
						onClick={isChung ? undefined : () => toggleSelectedPlayer(player.playerCode)}
						disabled={false}
						onEditScore={handleEditScore}
						token={token}
						matchCode={currentMatchCode}
						sendMessage={sendMessage}
					/>
				))
			}
		/>
	);
};

export default AVeDichPickQuestion;

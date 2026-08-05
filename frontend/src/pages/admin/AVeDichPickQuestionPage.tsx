

import { startTransition, useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { CheckCircle, RotateCcw, RefreshCw } from "lucide-react";
import AVeDichPickLayout from "@/pages/admin/AVeDichPickLayout";
import APlayerBar from "@/components/admin/APlayerBar";
import AControlButton from "@/components/admin/AControlButton";
import { useGameWebSocket } from "@/hooks/useGameWebSocket";
import { createLogger } from "@/utils/logger";
import { buildPlayersSnapshot } from "@/utils/playerHelpers";
import { compareVeDichCodes, generateVeDichPlaceholderCodes, getVeDichMeta } from "@/utils/veDichGrid";
import { VeDichRound, getVeDichRoundLabel } from "@/types/veDich";
import type { PlayerStatus } from "@/types/player";
import type { Question } from "@/types/question";
import { API_BASE_URL } from "@/configs";

const logger = createLogger("AVeDichPick");

const AVeDichPickQuestion = () => {
	const { matchCode: paramMatchCode } = useParams<{ matchCode: string }>();
	const currentMatchCode = localStorage.getItem("matchCode") || paramMatchCode || "";
	const token = localStorage.getItem("jwtToken_admin") ?? "";
	const { lastMessage, sendMessage } = useGameWebSocket();
	const navigate = useNavigate();

	useEffect(() => {
		if (!currentMatchCode) {
			navigate("/admin/manage");
		}
	}, [currentMatchCode, navigate]);

	const currentPath = window.location.pathname;
	const isChung = currentPath.includes("/vdc/pick") && !currentPath.includes("/vdr/");
	const round = isChung ? VeDichRound.CHUNG : VeDichRound.RIENG;
	const roundTitle = getVeDichRoundLabel(round);

	const [players, setPlayers] = useState<PlayerStatus[]>([]);

	const [selectedPlayerCode, setSelectedPlayerCode] = useState<string | null>(null);
	const [questions, setQuestions] = useState<Question[]>([]);
	const [usedQuestionCodes, setUsedQuestionCodes] = useState<string[]>([]);
	const [selectedQuestionCodes, setSelectedQuestionCodes] = useState<string[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [errorMessage, setErrorMessage] = useState<string>("");
	const [successMessage, setSuccessMessage] = useState<string>("");

	const [placeholderQuestions, setPlaceholderQuestions] = useState<Question[]>([]);

	const requiredCount = isChung ? players.length : round;

	const questionCategories = questions.map((q, idx) => getVeDichMeta(q.questionCode, idx).category);
	const questionPoints     = questions.map((q, idx) => getVeDichMeta(q.questionCode, idx).points);

	const toggleQuestionSelection = useCallback((questionCode: string) => {

		if (!isChung && !selectedPlayerCode) {
			setErrorMessage("Vui lòng chọn thí sinh tham gia lượt thi trước");
			return;
		}

		setSelectedQuestionCodes((prev) => {
			const isSelected = prev.includes(questionCode);
			if (isSelected) {
				return prev.filter((code) => code !== questionCode);
			} else {

				if (prev.length < requiredCount) {
					return [...prev, questionCode];
				}
				return prev;
			}
		});
	}, [requiredCount, isChung, selectedPlayerCode]);

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

		if (allCodes.length > 0) {
			localStorage.setItem(`vd_pick_all_codes_${currentMatchCode}`, JSON.stringify(allCodes));
		}
		if (selectedQuestionCodes.length > 0) {
			localStorage.setItem(`vd_pick_selected_${currentMatchCode}`, JSON.stringify(selectedQuestionCodes));
		} else {
			localStorage.removeItem(`vd_pick_selected_${currentMatchCode}`);
		}
	}, [selectedQuestionCodes, questions, currentMatchCode, isChung, sendMessage]);

	useEffect(() => {
		if (!currentMatchCode) return;
		if (isChung) return;

		sendMessage({ type: "blocked_buzz", user_code: selectedPlayerCode ?? null, match_code: currentMatchCode });

		try {
			localStorage.setItem(`vd_rieng_selected_player_${currentMatchCode}`, selectedPlayerCode ?? "");
		} catch {  }
	}, [selectedPlayerCode, currentMatchCode, isChung, sendMessage]);

	const toggleSelectedPlayer = useCallback((playerCode: string) => {
		setSelectedPlayerCode((prev) => (prev === playerCode ? null : playerCode));
	}, []);

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

			const profiles = playersList.map((entry: any) => ({
				user_code: entry.user_code,
				user_name: entry.user_name ?? "",
			}));

			setPlayers((prev) => buildPlayersSnapshot(playersList, scoreList, profiles, prev));

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

	const sendSpecificRoundSnapshot = useCallback(async () => {
		if (!currentMatchCode) return;
		const allCodes = questions.map((q) => q.questionCode);
		await sendMessage({
			type: "vd_selection_update",
			match_code: currentMatchCode,
			round: isChung ? "chung" : "rieng",
			selected_question_codes: selectedQuestionCodes,
			all_question_codes: allCodes,
			used_question_codes: usedQuestionCodes,
		});
		if (selectedQuestionCodes.length > 0) {
			const payload = {
				type: "vd_questions_selected",
				match_code: currentMatchCode,
				round: isChung ? "chung" : "rieng",
				selected_question_codes: selectedQuestionCodes,
				all_question_codes: allCodes,
				question_metadata: selectedQuestionCodes.map((code) => {
					const idx = allCodes.findIndex((c) => c === code);
					return { code, category: questionCategories[idx] ?? `Category ${Math.floor(idx / 4) + 1}`, points: questionPoints[idx] ?? 0 };
				}),
				timestamp: Date.now(),
			};
			if (!isChung) (payload as any).selected_player_code = selectedPlayerCode ?? null;
			await sendMessage(payload);
		}
	}, [currentMatchCode, isChung, loadPlayersState, questionCategories, questionPoints, questions, selectedPlayerCode, selectedQuestionCodes, sendMessage, usedQuestionCodes]);

	const sendRoundSnapshot = useCallback(async () => {
		await loadPlayersState();
		await sendSpecificRoundSnapshot();
	}, [loadPlayersState, sendSpecificRoundSnapshot]);

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

	useEffect(() => {
		if (!currentMatchCode) return;
		try {
			const stored = localStorage.getItem(`vd_rieng_selected_player_${currentMatchCode}`);
			if (stored) setSelectedPlayerCode(stored || null);
		} catch {  }
	}, [currentMatchCode]);

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

		if (currentMatchCode) {
			sendMessage({
				type: "vd_selection_update",
				match_code: currentMatchCode,
				round: isChung ? "chung" : "rieng",
				selected_question_codes: [],
				all_question_codes: allPlaceholderCodes,
				used_question_codes: [],
			});

			try {
				localStorage.setItem(`vd_pick_all_codes_${currentMatchCode}`, JSON.stringify(allPlaceholderCodes));
			} catch {  }
		}
	}, [currentMatchCode, isChung, sendMessage]);

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

				const veDichRaw = rawQuestions.filter((q: { question_code?: string }) =>
					q.question_code?.includes("_VD_") || q.question_code?.startsWith("OC3_Q_VD")
				);

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

				const used = veDichRaw
					.filter((q: { is_used?: boolean }) => q.is_used === true)
					.map((q: { question_code: string }) => q.question_code);

				try {
					const storedUsed = localStorage.getItem(`vd_used_codes_${currentMatchCode}`);
					if (storedUsed) {
						const usedCodes = JSON.parse(storedUsed) as string[];
						setUsedQuestionCodes([...new Set([...used, ...usedCodes])]);
					} else {

						const storedChungStates = localStorage.getItem(`vd_chung_states_${currentMatchCode}`);
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

				mapped.sort((a, b) => compareVeDichCodes(a.questionCode, b.questionCode));

				const deduped = mapped.filter((q, i, arr) =>
					arr.findIndex((q2) => q2.questionCode === q.questionCode) === i,
				);

				if (deduped.length === 0) {
					setErrorMessage("Không tìm thấy câu hỏi Về Đích cho trận đấu này");
				}

				setQuestions(deduped);

				const allCodes = deduped.map((q) => q.questionCode);
				if (currentMatchCode && allCodes.length > 0) {
					try {
						localStorage.setItem(`vd_pick_all_codes_${currentMatchCode}`, JSON.stringify(allCodes));
					} catch (err) {
						logger.error("Failed to persist question codes to localStorage:", err);
					}
				}

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

	useEffect(() => {
		if (!lastMessage) return;

		startTransition(() => {

			if (Array.isArray(lastMessage)) {
				const snapshot = buildPlayersSnapshot(lastMessage, [], [], players);
				setPlayers(snapshot);
			}
		});
	}, [lastMessage, players]);

	const handleConfirmSelection = useCallback(async () => {
		if (requiredCount === 0) {
			setErrorMessage("Chưa tải được danh sách thí sinh");
			return;
		}

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

			setUsedQuestionCodes((prev) => [...new Set([...prev, ...selectedQuestionCodes])]);
			if (currentMatchCode) {
				try {
					const existing = JSON.parse(
						localStorage.getItem(`vd_used_codes_${currentMatchCode}`) ?? "[]"
					) as string[];
					localStorage.setItem(
						`vd_used_codes_${currentMatchCode}`,
						JSON.stringify([...new Set([...existing, ...selectedQuestionCodes])]),
					);
				} catch {  }
			}

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
			void sendRoundSnapshot();

			const playerPath = isChung ? "/player/vdc" : "/player/vdr";
			sendMessage({ type: "navigate", user_code: "", path: playerPath });

			if (currentMatchCode) {
				const codesKey = isChung
					? `vd_chung_codes_${currentMatchCode}`
					: `vd_rieng_codes_${currentMatchCode}`;
				localStorage.setItem(codesKey, JSON.stringify(selectedQuestionCodes));
				if (!isChung) {
					const selKey = `vd_rieng_selected_player_${currentMatchCode}`;
					localStorage.setItem(selKey, selectedPlayerCode ?? "");
				}
			}
			setSuccessMessage(`Đã chọn ${requiredCount} câu hỏi. Chuyển đến vòng thi...`);

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
	}, [selectedQuestionCodes, questions, requiredCount, currentMatchCode, isChung, sendMessage, navigate, selectedPlayerCode, questionCategories, questionPoints, sendRoundSnapshot]);

	const handleResetSelection = useCallback(() => {
		setSelectedQuestionCodes([]);
		setErrorMessage("");
		setSuccessMessage("");
	}, []);

	const handleResetUsedQuestions = useCallback(() => {
		if (!currentMatchCode) return;
		try {

			setUsedQuestionCodes([]);

			try {
				localStorage.removeItem(`vd_used_codes_${currentMatchCode}`);
			} catch {}
			try {
				localStorage.removeItem(`vd_chung_codes_${currentMatchCode}`);
			} catch {}
			try {
				localStorage.removeItem(`vd_rieng_codes_${currentMatchCode}`);
			} catch {}

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

	const topControlButtons = (
		<>
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

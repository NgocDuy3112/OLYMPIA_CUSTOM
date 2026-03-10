/* eslint-disable @typescript-eslint/no-explicit-any */
import { startTransition, useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { CheckCircle, RotateCcw } from "lucide-react";
import AVeDichPickLayout from "@/pages/admin/AVeDichPickLayout";
import APlayerBar from "@/components/admin/APlayerBar";
import { useAdminWebSocket } from "@/hooks/useAdminWebSocket";
import { createLogger } from "@/utils/logger";
import { buildPlayersSnapshot } from "@/utils/playerHelpers";
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
 * - /admin/vdcn/pick/:matchCode → Lượt Riêng (3 questions)
 */

// Question metadata (category labels). Format: "PRIMARY|SECONDARY" when a subcategory exists
const CATEGORIES = [
	"TOÁN - TIN - THỐNG KÊ",
	"TỰ NHIÊN - SỰ SỐNG",
	"KINH TẾ - XÃ HỘI",
	"VĂN HỌC - NGHỆ THUẬT",
	"VĂN HÓA - THỂ THAO",
	"KIẾN THỨC TỔNG HỢP",
];

const AVeDichPickQuestion = () => {
	const { matchCode: paramMatchCode } = useParams<{ matchCode: string }>();
	const currentMatchCode = localStorage.getItem("matchCode") || paramMatchCode || "";
	const token = localStorage.getItem("jwtToken_admin") ?? "";
	const { lastMessage, sendMessage } = useAdminWebSocket();

	// Determine round type from current path
	const currentPath = window.location.pathname;
	const isChung = currentPath.includes("/vdc/");
	const round = isChung ? VeDichRound.CHUNG : VeDichRound.RIENG;
	const roundTitle = getVeDichRoundLabel(round);

	// State
	const [players, setPlayers] = useState<PlayerStatus[]>([]);
	const [questions, setQuestions] = useState<Question[]>([]);
	const [usedQuestionCodes, setUsedQuestionCodes] = useState<string[]>([]);
	const [selectedQuestionCodes, setSelectedQuestionCodes] = useState<string[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [errorMessage, setErrorMessage] = useState<string>("");
	const [successMessage, setSuccessMessage] = useState<string>("");

	// Build question categories and points for display
	// Assuming questions are ordered: 6 categories × 4 points each (24 total)
	const questionCategories = questions.map((_, idx) => {
		const categoryIdx = Math.floor(idx / 4);
		return CATEGORIES[categoryIdx] || `Category ${categoryIdx + 1}`;
	});

	const questionPoints = questions.map((_, idx) => {
		const pointIdx = idx % 4;
		return [20, 30, 40, 50][pointIdx] || 0;
	});

	// Track selected question codes
	const toggleQuestionSelection = useCallback((questionCode: string) => {
		setSelectedQuestionCodes((prev) => {
			const isSelected = prev.includes(questionCode);
			if (isSelected) {
				return prev.filter((code) => code !== questionCode);
			} else {
				// Only allow selecting up to maxQuestions
				if (prev.length < round) {
					return [...prev, questionCode];
				}
				return prev;
			}
		});
	}, [round]);

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
		} catch (err) {
			logger.error("Failed to load players:", err);
		}
	}, [currentMatchCode, token]);

	useEffect(() => {
		loadPlayersState();
	}, [loadPlayersState]);

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
				setUsedQuestionCodes(used);

				// Sort by question_code for consistent ordering
				mapped.sort((a, b) => a.questionCode.localeCompare(b.questionCode));

				if (mapped.length === 0) {
					setErrorMessage("Không tìm thấy câu hỏi Về Đích cho trận đấu này");
				}

				setQuestions(mapped);
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
		if (selectedQuestionCodes.length !== round) {
			setErrorMessage(`Vui lòng chọn đủ ${round} câu hỏi`);
			return;
		}

		try {
			setErrorMessage("");
			setSuccessMessage("");

			// Mark selected questions as used in local state only (no DB persistence)
			setUsedQuestionCodes((prev) => [...new Set([...prev, ...selectedQuestionCodes])]);

			// Notify players via WebSocket
			const payload = {
				type: "veDich_questions_selected",
				match_code: currentMatchCode,
				round: isChung ? "chung" : "rieng",
				selected_question_codes: selectedQuestionCodes,
				timestamp: Date.now(),
			};
			sendMessage(payload);
			setSuccessMessage(`Đã chọn ${round} câu hỏi. Chuyển đến vòng thi...`);

			// Clear selection after brief feedback
			setTimeout(() => {
				setSelectedQuestionCodes([]);
				setSuccessMessage("");
			}, 2000);
		} catch (err) {
			logger.error("Failed to confirm selection:", err);
			setErrorMessage("Lỗi khi xác nhận câu hỏi");
		}
	}, [selectedQuestionCodes, round, currentMatchCode, isChung, sendMessage]);

	const handleResetSelection = useCallback(() => {
		setSelectedQuestionCodes([]);
		setErrorMessage("");
		setSuccessMessage("");
	}, []);

	const topControlButtons = (
		<>
			<button
				onClick={handleConfirmSelection}
				disabled={selectedQuestionCodes.length !== round || isLoading}
				className={`
					flex items-center gap-2 px-6 py-3 rounded-lg font-bold text-white transition-all
					${selectedQuestionCodes.length === round && !isLoading
						? "bg-blue-600 hover:bg-blue-700 cursor-pointer"
						: "bg-gray-400 cursor-not-allowed opacity-50"
					}
				`}
			>
				<CheckCircle size={20} />
				Xác nhận ({selectedQuestionCodes.length}/{round})
			</button>

			<button
				onClick={handleResetSelection}
				className="flex items-center gap-2 px-6 py-3 rounded-lg font-bold text-white bg-blue-600 hover:bg-blue-700 transition-all"
			>
				<RotateCcw size={20} />
				Đặt lại
			</button>
		</>
	);

	const bottomActionButtons = (
		<>
			{isLoading && <p className="text-blue-600 font-semibold">Đang tải câu hỏi...</p>}
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
			round={round}
			questions={questions}
			categories={questionCategories}
			points={questionPoints}
			selectedQuestionCodes={selectedQuestionCodes}
			onQuestionSelect={toggleQuestionSelection}
			disabledQuestionCodes={usedQuestionCodes}
			topControlButtons={topControlButtons}
			bottomActionButtons={bottomActionButtons}
			statusMessages={statusMessages}
			renderPlayerList={() =>
				players.map((player) => (
					<APlayerBar
						key={player.playerCode}
						player={player}
						isActive={player.playerConnected ?? true}
					/>
				))
			}
		/>
	);
};

export default AVeDichPickQuestion;

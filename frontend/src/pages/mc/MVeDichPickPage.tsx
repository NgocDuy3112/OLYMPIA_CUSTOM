/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { PBasePageLayout } from "@/pages/player/PBasePageLayout";
import VeDichQuestionCard from "@/components/shared/VeDichQuestionCard";
import { useMcWebSocket } from "@/hooks/useMcWebSocket";
import { useMcSession } from "@/hooks/useMcSession";
import { useMcPlayers } from "@/hooks/useMcPlayers";
import { VeDichRound, getVeDichRoundLabel } from "@/types/veDich";

const CATEGORIES = [
	"TOÁN - TIN - THỐNG KÊ",
	"TỰ NHIÊN - SỰ SỐNG",
	"KINH TẾ - XÃ HỘI",
	"VĂN HỌC - NGHỆ THUẬT",
	"VĂN HÓA - THỂ THAO",
	"KIẾN THỨC TỔNG HỢP",
];

interface MVeDichPickPageProps {
	round: VeDichRound;
}

/**
 * MVeDichPickPage — Read-only MC view of the admin's question-picking screen.
 *
 * MC sees the full Jeopardy-style question grid and selected preview.
 * Updates in real-time via WebSocket as admin toggles selections.
 *
 * WS messages consumed:
 *   - "send_players_info"       → update player scoreboard
 *   - "veDich_selection_update" → live highlight as admin toggles
 *   - "veDich_questions_selected" → admin confirmed selection
 *   - "veDich_questions_meta"   → question metadata broadcast
 */
const MVeDichPickPage = ({ round }: MVeDichPickPageProps) => {
	const { matchCode: paramMatchCode } = useParams<{ matchCode: string }>();
	const { matchCode: sessionMatchCode } = useMcSession();
	const matchCode = paramMatchCode || sessionMatchCode;
	const { lastMessage } = useMcWebSocket();
	const { players, applyPlayersInfo } = useMcPlayers();

	// Sorted list of all question codes — received from admin via veDich_selection_update
	const [allQuestionCodes, setAllQuestionCodes] = useState<string[]>(() => {
		if (!matchCode) return [];
		try {
			const stored = localStorage.getItem(`veDich_pick_all_codes_${matchCode}`);
			return stored ? (JSON.parse(stored) as string[]) : [];
		} catch { return []; }
	});
	// Live selection as admin toggles (before confirm)
	const [liveSelectedCodes, setLiveSelectedCodes] = useState<string[]>(() => {
		if (!matchCode) return [];
		try {
			const stored = localStorage.getItem(`veDich_pick_selected_${matchCode}`);
			return stored ? (JSON.parse(stored) as string[]) : [];
		} catch { return []; }
	});
	// Confirmed selection after admin clicks XÁC NHẬN
	const [confirmedCodes, setConfirmedCodes] = useState<string[]>([]);
	// Questions from prior rounds that are grayed out and unselectable
	const [usedQuestionCodes, setUsedQuestionCodes] = useState<string[]>([]);

	// WebSocket message handling
	useEffect(() => {
		if (!lastMessage) return;
		const msg: any = lastMessage;

		switch (msg?.type) {
			case "send_players_info": {
				applyPlayersInfo(msg);
				break;
			}

			case "veDich_selection_update": {
				const codes = msg.selected_question_codes ?? [];
				setLiveSelectedCodes(Array.isArray(codes) ? codes : []);
				const allCodes = msg.all_question_codes;
				if (Array.isArray(allCodes) && allCodes.length > 0) {
					setAllQuestionCodes(allCodes as string[]);
				}
				const usedCodes = msg.used_question_codes;
				if (Array.isArray(usedCodes)) {
					setUsedQuestionCodes(usedCodes as string[]);
				}
				break;
			}

			case "veDich_questions_selected":
			case "veDich_questions_meta": {
				const codes = msg.selected_question_codes ?? [];
				const finalCodes = Array.isArray(codes) ? codes : [];
				setConfirmedCodes(finalCodes);
				setLiveSelectedCodes(finalCodes);
				const allCodes2 = msg.all_question_codes;
				if (Array.isArray(allCodes2) && allCodes2.length > 0) {
					setAllQuestionCodes(allCodes2 as string[]);
				}
				break;
			}

			default:
				break;
		}
	}, [lastMessage, applyPlayersInfo]);

	const maxQuestions = round === VeDichRound.CHUNG ? Math.max(players.length, 1) : round;
	const title = getVeDichRoundLabel(round);

	// Prefer confirmed codes; fall back to live selection
	const displayCodes = confirmedCodes.length > 0 ? confirmedCodes : liveSelectedCodes;

	return (
		<PBasePageLayout players={players} currentPlayerCode="">
			<div className="p-5 rounded-xl flex flex-col bg-blue-900 border-2 border-blue-600 shadow-xl gap-4 w-full">
				{/* Board header */}
				<div className="flex items-center gap-4 pb-1">
					<p className="text-4xl font-[SVN-Gratelos_Display] font-extrabold text-blue-300 uppercase shrink-0">
						{title}
					</p>

					<div className="flex-1" />

					{/* Selected questions preview */}
					<div className="flex gap-1">
						{Array.from({ length: maxQuestions }).map((_, i) => {
							const code = displayCodes[i];
							if (!code) {
								return (
									<div key={`slot-empty-${i}`} className="w-55 shrink-0 h-20">
										<VeDichQuestionCard placeholder category="" points={undefined} disabled />
									</div>
								);
							}

							const qIndex = allQuestionCodes.indexOf(code);
							const rawCategory = CATEGORIES[Math.floor(qIndex / 4)] || "";
							const point = ([20, 30, 40, 50])[qIndex % 4] || 0;
							const [catPrimary, catSecondary] = rawCategory.split("|").map((s: string) => s?.trim());

							return (
								<div key={`slot-${code}`} className="w-55 shrink-0 h-20">
									<VeDichQuestionCard
										category={catPrimary || rawCategory}
										subcategory={catSecondary}
										points={point}
										isSelected
										disabled={false}
									/>
								</div>
							);
						})}
					</div>

					<p className="font-[SVN-Gratelos_Display] font-extrabold text-blue-300 shrink-0 text-2xl">
						{displayCodes.length}/{maxQuestions}
					</p>
				</div>

				{/* Divider */}
				<div className="border-t border-blue-700" />

				{/* Read-only question grid — 6 categories × 4 point values */}
				<div
					className="grid gap-3"
					style={{ gridTemplateColumns: "repeat(4, 1fr)", gridAutoRows: "minmax(58px, 58px)" }}
				>
					{Array.from({ length: 6 * 4 }).map((_, idx) => {
						const questionCode = allQuestionCodes[idx];
						if (!questionCode) {
							return (
								<VeDichQuestionCard
									key={`slot-${idx}`}
									placeholder
									category=""
									points={undefined}
									disabled
								/>
							);
						}

						const rawCategory = CATEGORIES[Math.floor(idx / 4)] || "";
						const point = ([20, 30, 40, 50])[idx % 4] || 0;
						const [catPrimary, catSecondary] = rawCategory.split("|").map((s: string) => s?.trim());
						const isSelected = displayCodes.includes(questionCode);
						const isUsed = usedQuestionCodes.includes(questionCode);

						return (
							<VeDichQuestionCard
								key={questionCode}
								category={catPrimary || rawCategory}
								subcategory={catSecondary}
								points={point}
								isSelected={isSelected}
								disabled={isUsed}
							/>
						);
					})}
				</div>
			</div>
		</PBasePageLayout>
	);
};

export default MVeDichPickPage;

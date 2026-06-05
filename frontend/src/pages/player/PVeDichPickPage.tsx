/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { PBasePageLayout } from "@/pages/player/PBasePageLayout";
import VeDichQuestionCard from "@/components/shared/VeDichQuestionCard";
import { usePlayerWebSocket } from "@/hooks/usePlayerWebSocket";
import { usePlayerSession } from "@/hooks/usePlayerSession";
import { VeDichRound, getVeDichRoundLabel } from "@/types/veDich";
import type { PlayerStatus } from "@/types/player";

const CATEGORIES = [
	"TOÁN - TIN - THỐNG KÊ",
	"TỰ NHIÊN - SỰ SỐNG",
	"KINH TẾ - XÃ HỘI",
	"VĂN HỌC - NGHỆ THUẬT",
	"VĂN HÓA - THỂ THAO",
	"KIẾN THỨC TỔNG HỢP",
];

interface PVeDichPickPageProps {
	round: VeDichRound;
}

/**
 * PVeDichPickPage — Read-only player view of the admin's question-picking screen.
 *
 * Players see the full Jeopardy-style question grid.
 * As the admin selects questions, this page highlights them in real-time via WebSocket.
 * When the admin confirms, transitions to the gameplay page automatically.
 *
 * WS messages consumed:
 *   - "send_players_info"       → update player scoreboard
 *   - "vd_selection_update" → live highlight as admin toggles
 *   - "vd_questions_selected" → admin confirmed selection
 *   - "navigate"                → handled by global AutoNavigator in PlayerRoutes
 */
const PVeDichPickPage = ({ round }: PVeDichPickPageProps) => {
	const { playerCode: paramPlayerCode, matchCode: paramMatchCode } = useParams<{
		matchCode: string;
		playerCode: string;
	}>();
	const { playerCode: sessionPlayerCode } = usePlayerSession();
	const playerCode = paramPlayerCode || sessionPlayerCode;
	const { lastMessage } = usePlayerWebSocket();

	const [players, setPlayers] = useState<PlayerStatus[]>([]);
	// Sorted list of all question codes — received from admin via vd_selection_update
	// Fallback: generate placeholder codes if not received yet
	const [allQuestionCodes, setAllQuestionCodes] = useState<string[]>(() => {
		if (!paramMatchCode) return [];
		try {
			const stored = localStorage.getItem(`veDich_pick_all_codes_${paramMatchCode}`);
			const codes = stored ? (JSON.parse(stored) as string[]) : [];
			// If we have codes, use them; otherwise return empty array (will use fallback in render)
			return codes.length > 0 ? codes : [];
		} catch { return []; }
	});
	// Live selection as admin toggles (before confirm)
	// Also initialized from localStorage so late-arriving players see current selection
	const [liveSelectedCodes, setLiveSelectedCodes] = useState<string[]>(() => {
		if (!paramMatchCode) return [];
		try {
			const stored = localStorage.getItem(`veDich_pick_selected_${paramMatchCode}`);
			return stored ? (JSON.parse(stored) as string[]) : [];
		} catch { return []; }
	});
	// Confirmed selection after admin clicks XÁC NHẬN
	const [confirmedCodes, setConfirmedCodes] = useState<string[]>([]);
	// Questions from prior rounds that are grayed out and unselectable.
	// Hydrate from localStorage so late-arriving players see the correct state
	// even if they miss the WS message (admin broadcasts on BẮT ĐẦU click).
	// Admin will keep the in-app state in sync via vd_selection_update.
	const [usedQuestionCodes, setUsedQuestionCodes] = useState<string[]>(() => {
		if (!paramMatchCode) return [];
		try {
			const stored = localStorage.getItem(`veDich_used_codes_${paramMatchCode}`);
			return stored ? (JSON.parse(stored) as string[]) : [];
		} catch { return []; }
	});

	// WebSocket message handling
	useEffect(() => {
		if (!lastMessage) return;
		const msg: any = lastMessage;

		switch (msg?.type) {
			case "navigate": {
				// Navigate handled by global AutoNavigator in PlayerRoutes
				// Do NOT clear usedQuestionCodes here - admin will send correct used_question_codes via vd_selection_update
				break;
			}

			case "send_players_info": {
				const playersList = msg.players ?? [];
				const scoreboard = msg.scoreboard ?? [];
				const profiles = msg.profiles ?? [];

				const finalPlayers: PlayerStatus[] = playersList.map((p: any) => {
					const code = String(p?.user_code ?? "");

					let name = "";
					if (p?.user_name) {
						name = p.user_name;
					} else {
						const prof = profiles.find((pr: any) => String(pr?.user_code) === code);
						if (prof) {
							name = prof.user_name ?? "";
						} else {
							const scoreEntry = scoreboard.find((s: any) => String(s?.user_code) === code);
							name = scoreEntry?.user_name ?? "";
						}
					}

					let scoreVal = 0;
					if (typeof p?.cumulative_score === "number") scoreVal = p.cumulative_score;
					else if (typeof p?.cumulative_score === "number") scoreVal = p.cumulative_score;
					else {
						const scoreEntry = scoreboard.find((s: any) => String(s?.user_code) === code);
						if (scoreEntry)
							scoreVal =
								scoreEntry?.cumulative_score ??
								scoreEntry?.cumulative_score ??
								scoreEntry?.total_score ??
								scoreEntry?.score ??
								0;
					}

					return {
						playerCode: code,
						playerName: name,
						playerScore: scoreVal,
						playerLastAnswer: undefined,
						playerTimestamp: undefined,
						playerHasBuzzed: undefined,
					};
				});

				setPlayers(finalPlayers);
				break;
			}

			case "vd_selection_update": {
				// Live highlight as admin toggles individual questions
				const codes = msg.selected_question_codes ?? [];
				setLiveSelectedCodes(Array.isArray(codes) ? codes : []);
				// Build the question grid from the broadcasted full list
				const allCodes = msg.all_question_codes;
				if (Array.isArray(allCodes) && allCodes.length > 0) {
					setAllQuestionCodes(allCodes as string[]);
				}
				// Sync used (grayed-out) question codes from admin
				const usedCodes = msg.used_question_codes;
				if (Array.isArray(usedCodes)) {
					setUsedQuestionCodes(usedCodes as string[]);
				}
				break;
			}

			case "vd_questions_selected": {
				// Admin confirmed — lock in the final selection
				const codes = msg.selected_question_codes ?? [];
				const finalCodes = Array.isArray(codes) ? codes : [];
				setConfirmedCodes(finalCodes);
				setLiveSelectedCodes(finalCodes);
				// Also update the grid if all_question_codes is present
				const allCodes2 = msg.all_question_codes;
				if (Array.isArray(allCodes2) && allCodes2.length > 0) {
					setAllQuestionCodes(allCodes2 as string[]);
				}
				// Mark selected questions as used so they appear disabled in future pick pages
				setUsedQuestionCodes((prev) => {
					const updated = [...new Set([...prev, ...finalCodes])];
					// Persist to localStorage
					try {
						localStorage.setItem(`veDich_used_codes_${paramMatchCode}`, JSON.stringify(updated));
					} catch { /* ignore */ }
					return updated;
				});
				break;
			}

			default:
				break;
		}
	}, [lastMessage]);

	const maxQuestions = round === VeDichRound.CHUNG ? Math.max(players.length, 1) : round;
	const title = getVeDichRoundLabel(round);

	// Prefer confirmed codes; fall back to live selection
	const displayCodes = confirmedCodes.length > 0 ? confirmedCodes : liveSelectedCodes;

	return (
		<PBasePageLayout players={players} currentPlayerCode={playerCode}>
			<div className="p-5 rounded-xl flex flex-col bg-blue-900 border-2 border-blue-600 shadow-xl gap-4 w-full">
				{/* Board header */}
				<div className="flex items-center gap-4 pb-1">
{(() => {
					const parts = title.split(" - ");
					if (parts.length >= 2) {
						return (
							<div className="flex flex-col leading-tight shrink-0">
								<span className="text-4xl font-[SVN-Gratelos_Display] font-extrabold text-blue-300 uppercase">
									{parts[0]}
								</span>
								<span className="text-2xl font-[SVN-Gratelos_Display] font-extrabold text-blue-300 uppercase">
									{parts.slice(1).join(" - ")}
								</span>
							</div>
						);
					}
					return <span className="text-4xl font-[SVN-Gratelos_Display] font-extrabold text-blue-300 uppercase shrink-0">{title}</span>;
				})()}

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
				</div>

				{/* Divider */}
				<div className="border-t border-blue-700" />

				{/* Read-only question grid — 6 categories × 4 point values */}
				<div
					className="grid gap-4"
					style={{ gridTemplateColumns: "repeat(4, 1fr)", gridAutoRows: "minmax(76px, 76px)" }}
				>
					{Array.from({ length: 6 * 4 }).map((_, idx) => {
						const questionCode = allQuestionCodes[idx];
						// Fallback: use placeholder code if allQuestionCodes is empty
						const fallbackCode = `OC3_Q_VD_${Math.floor(idx / 4) + 1}_${(idx % 4) + 1}`;
						const displayCode = questionCode || fallbackCode;

						const rawCategory = CATEGORIES[Math.floor(idx / 4)] || "";
						const point = ([20, 30, 40, 50])[idx % 4] || 0;
						const [catPrimary, catSecondary] = rawCategory.split("|").map((s: string) => s?.trim());
						const isSelected = displayCodes.includes(displayCode);
						const isUsed = usedQuestionCodes.includes(displayCode);
						// Only disable if explicitly in usedQuestionCodes; allow enabling when admin starts the round
						const shouldDisable = isUsed;

						return (
							<VeDichQuestionCard
								key={displayCode}
								category={catPrimary || rawCategory}
								subcategory={catSecondary}
								points={point}
								isSelected={isSelected}
								disabled={shouldDisable}
							/>
						);
					})}
				</div>

			</div>
		</PBasePageLayout>
	);
};

export default PVeDichPickPage;

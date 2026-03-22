import type { ReactNode } from "react";
import AdminGameplayNavBar from "@/navigation/ANavBar";
import AQuestionBoard from "@/components/admin/AQuestionBoard";
import type { AdminQuestionBoardControls, ControlsRenderApi } from "@/types/questionBoardTypes";
import type { Question } from "@/types/question";

interface ABasePageLayoutProps {
	// Question board props
	questionTitle: string;
	question: Question;
	timerDuration: number;

	// Optional node rendered above the AQuestionBoard in the left column
	aboveQuestionBoard?: ReactNode;

	/** Tailwind height class forwarded to AQuestionBoard. Defaults to h-[50vh]. */
	boardHeightClass?: string;

	/** Tailwind height class forwarded to AQuestionBoard's answer/explanation box. Defaults to h-28. */
	answerBoxHeightClass?: string;

	/** When true, hides the answer/explanation box inside AQuestionBoard */
	hideAnswerBox?: boolean;

	// Optional controls configuration for the question board (numbers / subjects)
	controls?: AdminQuestionBoardControls;

	// Optional custom controls provided as a render-prop and passed into AQuestionBoard
	controlsChildren?: (api: ControlsRenderApi) => ReactNode;

	// Control buttons (top row - navigation/clock controls)
	topControlButtons: ReactNode;

	// Action buttons (bottom row - start/end/refresh controls)
	bottomActionButtons: ReactNode;

	// Optional status messages (buzzer winner, blocked player, etc.)
	statusMessages?: ReactNode;

	// Player list render function
	renderPlayerList: () => ReactNode;

	// Optional buttons rendered below the player list (e.g. TÍNH ĐIỂM, HIỆN TRẢ LỜI, CẬP NHẬT)
	playerSectionButtons?: ReactNode;
}

/**
 * ABasePageLayout - Reusable layout for admin gameplay pages
 *
 * This layout provides a consistent structure with:
 * - AdminGameplayNavBar at the top
 * - Left section (flex-3): Question board + control buttons
 * - Right section (flex-1): Player list with scrollable overflow
 *
 * Usage example:
 * ```tsx
 * <ABasePageLayout
 *   questionTitle="KHỞI ĐỘNG - LƯỢT CHUNG - CÂU HỎI SỐ 1"
 *   question={currentQuestion}
 *   timerDuration={timer}
 *   topControlButtons={<>...navigation buttons...</>}
 *   bottomActionButtons={<>...start/end buttons...</>}
 *   statusMessages={<p>Status message</p>}
 *   renderPlayerList={() => players.map(...)}
 * />
 * ```
 */
const ABasePageLayout = ({
	questionTitle,
	question,
	timerDuration,
	topControlButtons,
	bottomActionButtons,
	statusMessages,
	renderPlayerList,
	controls,
	controlsChildren,
	aboveQuestionBoard,
	boardHeightClass,
	answerBoxHeightClass,
	hideAnswerBox,
	playerSectionButtons,
}: ABasePageLayoutProps) => {
	return (
		<div className="flex flex-col h-screen overflow-hidden">
			<AdminGameplayNavBar />
			<div className="flex flex-row w-full flex-1 p-6 gap-8 overflow-hidden">
				{/* Left section: Question board and controls */}
				<div className="flex flex-col flex-3 gap-6 overflow-hidden">				{aboveQuestionBoard}
					<AQuestionBoard title={questionTitle} question={question} timerDuration={timerDuration} controls={controls} boardHeightClass={boardHeightClass} answerBoxHeightClass={answerBoxHeightClass} hideAnswerBox={hideAnswerBox}>
						{controlsChildren}
					</AQuestionBoard>

					<div className="flex flex-wrap items-center justify-center gap-4 max-w-220 mx-auto">
						{topControlButtons}
						{bottomActionButtons}
					</div>

					{/* Optional status messages */}
					{statusMessages}
				</div>

				{/* Right section: Player list + optional action buttons */}
				<div className="flex flex-col flex-1 gap-5 overflow-hidden">
					<div className="flex flex-col gap-5 overflow-hidden pr-2">{renderPlayerList()}</div>
					{playerSectionButtons && (
						<div className="flex flex-wrap items-center justify-center gap-4">
							{playerSectionButtons}
						</div>
					)}
				</div>
			</div>
		</div>
	);
};

export default ABasePageLayout;

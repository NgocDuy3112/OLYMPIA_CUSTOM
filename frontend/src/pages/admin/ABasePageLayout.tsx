import type { ReactNode } from "react";
import AdminGameplayNavBar from "@/navigation/ANavBar";
import AQuestionBoard from "@/components/admin/AQuestionBoard";
import type { Question } from "@/types/question";

interface ABasePageLayoutProps {
	// Question board props
	questionTitle: string;
	question: Question;
	timerDuration: number;

	// Control buttons (top row - navigation/clock controls)
	topControlButtons: ReactNode;

	// Action buttons (bottom row - start/end/refresh controls)
	bottomActionButtons: ReactNode;

	// Optional status messages (buzzer winner, blocked player, etc.)
	statusMessages?: ReactNode;

	// Player list render function
	renderPlayerList: () => ReactNode;
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
}: ABasePageLayoutProps) => {
	return (
		<>
			<AdminGameplayNavBar />
			<div className="flex flex-row w-screen h-screen p-6 gap-8">
				{/* Left section: Question board and controls */}
				<div className="flex flex-col flex-3 gap-6">
					<AQuestionBoard title={questionTitle} question={question} timerDuration={timerDuration} />

					<div className="flex flex-col items-center gap-6">
						{/* Top control buttons row */}
						<div className="flex flex-wrap gap-6 justify-center">{topControlButtons}</div>

						{/* Bottom action buttons row */}
						<div className="flex flex-wrap gap-6 justify-center">{bottomActionButtons}</div>

						{/* Optional status messages */}
						{statusMessages}
					</div>
				</div>

				{/* Right section: Player list */}
				<div className="flex flex-col flex-1 gap-5 overflow-y-auto pr-2">{renderPlayerList()}</div>
			</div>
		</>
	);
};

export default ABasePageLayout;

// VeDichQuestionCardProps defined below (with subcategory support)

/**
 * VeDichQuestionCard - Simple card showing points and category for About-round questions
 *
 * Used in "Vòng Về Dịch" to display question in Jeopardy-style board
 * Only shows: Điểm số + Lĩnh vực (not question text/content)
 *
 * States:
 * - available (blue): Can answer
 * - answered (blue): Already answered correctly
 * - answered-wrong (red): Answered but wrong
 *
 * Usage:
 * ```tsx
 * <VeDichQuestionCard
 *   question={q}
 *   category="Toán tin"
 *   points={30}
 *   state="available"
 *   isSelected={selectedCode === q.questionCode}
 *   onClick={() => handleSelect(q)}
 * />
 * ```
 */
interface VeDichQuestionCardProps {
	// Display info
	category: string; // Lĩnh vực (e.g. "Toán tin", "Tự nhiên")
	points?: number; // Điểm số (e.g. 20, 30, 40, 50) - optional for placeholder slots

	// Optional subcategory / topic (e.g. "Sự sống")
	subcategory?: string;

	// If true, render as an empty placeholder card (dashed border, no content)
	placeholder?: boolean;

	// State management
	state?: "available" | "answered" | "answered-wrong";
	isSelected?: boolean;

	// Event handlers
	onClick?: () => void;
	disabled?: boolean;
}


const VeDichQuestionCard = ({
	category,
	subcategory,
	points,
	state = "available",
	isSelected = false,
	onClick,
	disabled = false,
	placeholder = false,
}: VeDichQuestionCardProps) => {
	const getStateStyles = () => {
		if (placeholder) {
			return "bg-blue-800/30 text-transparent ring-0 border-2 border-dashed border-blue-500/50 pointer-events-none";
		}

		// Answered state always wins — must be checked before disabled to ensure
		// blue/red is shown even when the card is also disabled.
		if (state === "answered") {
			return "bg-blue-700 text-white ring-2 ring-blue-500 shadow-md shadow-blue-900/50 pointer-events-none";
		}
		if (state === "answered-wrong") {
			return "bg-red-800/80 text-white ring-2 ring-red-600 shadow-md shadow-red-900/50 pointer-events-none";
		}

		if (disabled) {
			// If the card is disabled but currently selected (active question during timer),
			// show it as selected (no strikethrough) so admin can see which question is running.
			if (isSelected) {
				return "bg-blue-500 text-white ring-2 ring-white shadow-md pointer-events-none";
			}
			return "bg-blue-950/70 text-blue-700/50 ring-1 ring-blue-900/60 cursor-not-allowed pointer-events-none line-through decoration-blue-700/50";
		}

		return "bg-blue-800 text-white ring-2 ring-blue-400 shadow-md shadow-blue-950/60 hover:bg-blue-700 hover:ring-blue-300 hover:shadow-blue-800/80";
	};

	// allow category to include a '|' delimiter: "Tự nhiên|Sự sống"
	const [catPrimary, catSecondary] = (category || "").split("|").map((s) => s?.trim());

	return (
		<button
			onClick={onClick}
			disabled={disabled || placeholder}
			aria-hidden={placeholder}
			className={`
					flex flex-col items-stretch justify-between px-3 py-2.5 rounded-lg
				border-2 border-transparent
				transition-all duration-150 font-bold w-full h-full
				${getStateStyles()}
				${isSelected && state === "available" ? "!border-white !bg-blue-500 text-white outline outline-2 outline-white outline-offset-[-1px]" : ""}
				${!disabled && state === "available" && !placeholder ? "cursor-pointer" : ""}
			`}
		>
			{/* Category + subcategory */}
			<span className="text-xs font-bold uppercase leading-tight line-clamp-2 tracking-wide drop-shadow-sm">
				{catPrimary || category}{(subcategory ?? catSecondary) ? ` / ${subcategory ?? catSecondary}` : ""}
			</span>

			{/* Points — large, centered */}
			{typeof points === "number" && (
				<span className="font-[SVN-Gratelos_Display] text-2xl font-extrabold leading-none self-center drop-shadow-md">{points}</span>
			)}
		</button>
	);
};

export default VeDichQuestionCard;

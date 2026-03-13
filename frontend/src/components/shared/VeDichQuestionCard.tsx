// VeDichQuestionCardProps defined below (with subcategory support)

/**
 * VeDichQuestionCard - Simple card showing points and category for About-round questions
 *
 * Used in "Vòng Về Dịch" to display question in Jeopardy-style board
 * Only shows: Điểm số + Lĩnh vực (not question text/content)
 *
 * States:
 * - available (blue): Can answer
 * - answered (green): Already answered correctly
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
			return "bg-blue-800/40 text-transparent ring-0 border-2 border-dashed border-blue-400/70 pointer-events-none";
		}

		if (disabled) {
			return "bg-blue-900 text-blue-300 ring-2 ring-blue-600 cursor-not-allowed pointer-events-none opacity-50";
		}

		switch (state) {
			case "answered":
				// keep green for correct answers but use same visual weight as player rec
				return "bg-green-600 hover:bg-green-700 text-white ring-0 shadow-sm";
			case "answered-wrong":
				return "bg-red-600 hover:bg-red-700 text-white ring-0 shadow-sm";
			default:
				// default (available) uses same palette as PPlayerRec: dark blue background with blue ring and muted text
				return "bg-blue-900 text-blue-300 ring-2 ring-blue-600 hover:bg-blue-800";
		}
	};

	// allow category to include a '|' delimiter: "Tự nhiên|Sự sống"
	const [catPrimary, catSecondary] = (category || "").split("|").map((s) => s?.trim());

	return (
		<button
			onClick={onClick}
			disabled={disabled || placeholder}
			aria-hidden={placeholder}
			className={`
					flex flex-row items-center gap-2 px-3 py-1 rounded-lg
				border-2 border-transparent hover:border-blue-300
				transition-all duration-150 font-bold w-full h-full
				${getStateStyles()}
				${isSelected ? "border-white ring-4 ring-white bg-blue-600 text-white shadow-xl" : ""}
				${!disabled && !state.startsWith("answered") && !placeholder ? "cursor-pointer" : ""}
			`}
		>
			{/* Points */}
			{typeof points === "number" && (
				<span className="font-[SVN-Gratelos_Display] text-xl font-extrabold leading-none shrink-0">{points}</span>
			)}

			{/* Category + subcategory inline */}
			<span className="text-sm font-semibold uppercase leading-tight truncate">
				{catPrimary || category}{(subcategory ?? catSecondary) ? ` / ${subcategory ?? catSecondary}` : ""}
			</span>
		</button>
	);
};

export default VeDichQuestionCard;

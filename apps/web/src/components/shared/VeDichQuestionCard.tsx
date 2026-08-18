interface VeDichQuestionCardProps {
  category: string;
  points?: number;

  subcategory?: string;

  placeholder?: boolean;

  state?: "available" | "answered" | "answered-wrong";
  isSelected?: boolean;

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

    if (state === "answered") {
      return "bg-blue-700 text-white ring-2 ring-blue-500 shadow-md shadow-blue-900/50 pointer-events-none";
    }
    if (state === "answered-wrong") {
      return "bg-red-800/80 text-white ring-2 ring-red-600 shadow-md shadow-red-900/50 pointer-events-none";
    }

    if (disabled) {
      if (isSelected) {
        return "bg-blue-500 text-white ring-2 ring-white shadow-md pointer-events-none";
      }
      return "bg-blue-950/70 text-blue-700/50 ring-1 ring-blue-900/60 cursor-not-allowed pointer-events-none line-through decoration-blue-700/50";
    }

    return "bg-blue-800 text-white ring-2 ring-blue-400 shadow-md shadow-blue-950/60 hover:bg-blue-700 hover:ring-blue-300 hover:shadow-blue-800/80";
  };

  const [catPrimary, catSecondary] = (category || "")
    .split("|")
    .map((s) => s?.trim());

  return (
    <button
      onClick={onClick}
      disabled={disabled || placeholder}
      aria-hidden={placeholder}
      className={`
				flex flex-col items-stretch justify-between px-2 sm:px-3 py-1.5 sm:py-2.5 rounded-lg
			border-2 border-transparent
			transition-all duration-150 font-bold w-full h-full min-h-0
				${getStateStyles()}
				${isSelected && state === "available" ? "!border-white !bg-blue-500 text-white outline outline-2 outline-white outline-offset-[-1px]" : ""}
				${!disabled && state === "available" && !placeholder ? "cursor-pointer" : ""}
			`}
    >
      {}
      <span className="text-[10px] sm:text-xs font-bold uppercase leading-tight line-clamp-2 tracking-wide drop-shadow-sm">
        {catPrimary || category}
        {(subcategory ?? catSecondary)
          ? ` / ${subcategory ?? catSecondary}`
          : ""}
      </span>

      {}
      {typeof points === "number" && (
        <span className="font-[SVN-Gratelos_Display] text-lg sm:text-2xl font-extrabold leading-none self-center drop-shadow-md">
          {points}
        </span>
      )}
    </button>
  );
};

export default VeDichQuestionCard;

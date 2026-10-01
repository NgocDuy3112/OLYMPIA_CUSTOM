import { Button } from "@/components/ui/button";

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
      return "bg-primary/20 text-transparent ring-0 border-2 border-dashed border-primary/50 pointer-events-none";
    }

    if (state === "answered") {
      return "bg-primary/80 text-primary-foreground ring-2 ring-primary shadow-md pointer-events-none";
    }
    if (state === "answered-wrong") {
      return "bg-destructive/80 text-destructive-foreground ring-2 ring-destructive shadow-md pointer-events-none";
    }

    if (disabled) {
      if (isSelected) {
        return "bg-brand text-background ring-2 ring-foreground shadow-md pointer-events-none";
      }
      return "bg-background/70 text-brand/50 ring-1 ring-primary/60 cursor-not-allowed pointer-events-none line-through decoration-primary/50";
    }

    return "bg-primary/60 text-primary-foreground ring-2 ring-brand shadow-md hover:bg-primary/80 hover:ring-brand";
  };

  const [catPrimary, catSecondary] = (category || "")
    .split("|")
    .map((s) => s?.trim());

  return (
    <Button
      variant="ghost"
      onClick={onClick}
      disabled={disabled || placeholder}
      aria-hidden={placeholder}
      className={`
				flex h-full w-full flex-col items-stretch justify-between rounded-lg px-2 sm:px-3 py-1.5 sm:py-2.5
			border-2 border-transparent
			transition-all duration-150 font-bold min-h-0
				${getStateStyles()}
				${isSelected && state === "available" ? "!border-foreground !bg-brand text-background outline outline-2 outline-foreground outline-offset-[-1px]" : ""}
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
        <span className="font-display text-lg sm:text-2xl font-extrabold leading-none self-center drop-shadow-md">
          {points}
        </span>
      )}
    </Button>
  );
};

export default VeDichQuestionCard;

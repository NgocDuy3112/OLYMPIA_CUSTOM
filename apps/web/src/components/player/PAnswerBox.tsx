import React from "react";
import { KeyRound } from "lucide-react";
import { Input } from "@/components/ui/input";

interface PAnswerBoxProps {
  answer: string;
  setAnswer: (answer: string) => void;
  isDisabled: boolean;
  onSubmit: () => void;
  placeholderString?: string;
  showKeyIcon?: boolean;
}

const PAnswerBox: React.FC<PAnswerBoxProps> = ({
  answer,
  setAnswer,
  isDisabled,
  onSubmit,
  placeholderString,
  showKeyIcon = false,
}) => {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (e.nativeEvent.isComposing) return;
    if (isDisabled) return;
    if (!answer.trim()) return;

    onSubmit();
    setAnswer("");
  };
  return (
    <div className="relative w-full">
      {showKeyIcon && (
        <KeyRound className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 text-brand pointer-events-none" />
      )}
      <Input
        type="text"
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={
          placeholderString ??
          (!isDisabled
            ? "Nhập câu trả lời của bạn tại khung này và nhấn Enter để xác nhận câu trả lời"
            : "Bạn không thể nhập đáp án tại thời điểm này")
        }
        disabled={isDisabled}
        className={`p-3 rounded-lg text-lg text-background text-center shadow-sm transition duration-150 border-primary border-4 bg-foreground disabled:bg-primary/40 disabled:cursor-not-allowed disabled:text-brand ${showKeyIcon ? "pr-12" : ""}`}
      />
      {showKeyIcon && (
        <KeyRound className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 text-brand pointer-events-none" />
      )}
    </div>
  );
};

export default PAnswerBox;

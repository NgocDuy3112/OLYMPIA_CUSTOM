import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const LETTERS = ["A", "B", "C", "D", "E", "F"];

interface QualifierOptionsInputProps {
  options: string[];
  correct: string;
  onChange: (options: string[]) => void;
  onCorrectChange: (letter: string) => void;
}

/** Grid nhập phương án A-D (thêm/bớt tới 6), convert JSON khi lưu. */
export function QualifierOptionsInput({ options, correct, onChange, onCorrectChange }: QualifierOptionsInputProps) {
  const set = (i: number, v: string) => {
    const next = [...options];
    next[i] = v;
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {options.map((opt, i) => {
          const letter = LETTERS[i] ?? String(i + 1);
          const isCorrect = correct === letter;
          return (
            <Button
              key={i}
              type="button"
              variant="ghost"
              onClick={() => onCorrectChange(letter)}
              title={isCorrect ? "Đáp án đúng — bấm để đổi" : "Bấm để chọn làm đáp án đúng"}
              className={`gap-2 rounded-lg border px-3 py-2 text-left transition-colors ${
                isCorrect
                  ? "bg-green-600/20 border-green-600 text-green-200"
                  : "bg-white/5 border-white/10 hover:bg-white/10"
              }`}
            >
              <span
                className={`w-6 h-6 shrink-0 flex items-center justify-center rounded-md font-mono text-xs font-bold ${
                  isCorrect ? "bg-green-600 text-white" : "bg-white/10 text-gray-400"
                }`}
              >
                {letter}
              </span>
              <Input
                value={opt}
                onChange={(e) => set(i, e.target.value)}
                onClick={(e) => e.stopPropagation()}
                placeholder={`Phương án ${letter}`}
                className="h-auto flex-1 border-0 bg-transparent px-0 text-sm text-white shadow-none placeholder:text-gray-500 focus-visible:border-0 focus-visible:ring-0"
              />
            </Button>
          );
        })}
      </div>
      <div className="flex gap-2">
        {options.length < 6 && (
          <Button
            type="button"
            variant="secondary"
            size="xs"
            onClick={() => onChange([...options, ""])}
            className="gap-1 bg-white/10 hover:bg-white/15 text-xs text-white"
          >
            <Plus size={12} /> Thêm (tối đa 6)
          </Button>
        )}
        {options.length > 4 && (
          <Button
            type="button"
            variant="secondary"
            size="xs"
            onClick={() => {
              const next = options.slice(0, -1);
              onChange(next);
              if (!LETTERS.slice(0, next.length).includes(correct)) onCorrectChange("A");
            }}
            className="gap-1 bg-white/10 hover:bg-white/15 text-xs text-white"
          >
            <Minus size={12} /> Bớt
          </Button>
        )}
      </div>
    </div>
  );
}

export default QualifierOptionsInput;

import React from "react";
import { KeyRound } from "lucide-react";


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
    showKeyIcon = false
}) => {
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        if (e.nativeEvent.isComposing) return;
        if (isDisabled) return;
        if (!answer.trim()) return;

        onSubmit();
        setAnswer("");
    }
    return (
        <div className="relative w-full">
            {showKeyIcon && (
                <KeyRound className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 text-blue-600 pointer-events-none" />
            )}
            <input
                type="text"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                    placeholderString ?? (!isDisabled
                        ? 'Nhập câu trả lời của bạn tại khung này và nhấn Enter để xác nhận câu trả lời'
                        : 'Bạn không thể nhập đáp án tại thời điểm này')
                }
                disabled={isDisabled}
                className={`w-full p-3 rounded-lg text-lg text-black text-center shadow-sm transition duration-150 border-blue-500 border-4 bg-white disabled:bg-blue-900 disabled:cursor-not-allowed disabled:text-blue-300 ${showKeyIcon ? 'pr-12' : ''}`}
            />
            {showKeyIcon && (
                <KeyRound className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 text-blue-600 pointer-events-none" />
            )}
        </div>
    )
}

export default PAnswerBox;
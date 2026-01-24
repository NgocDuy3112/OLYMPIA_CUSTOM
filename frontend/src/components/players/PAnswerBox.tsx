import React from "react";


interface PAnswerBoxProps {
    answer: string;
    setAnswer: (answer: string) => void;
    isDisabled: boolean;
    onSubmit: () => void;
    placeholderString?: string;
}



const PAnswerBox: React.FC<PAnswerBoxProps> = ({ 
    answer, 
    setAnswer, 
    isDisabled, 
    onSubmit,
    placeholderString
}) => {
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (e.nativeEvent.isComposing || !answer.trim()) {return;}
        }
        if (!isDisabled) {
            onSubmit();
            setAnswer('');
        }
    }
    return (
        <input
            type="text"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={!isDisabled ? placeholderString || 'Nhập câu trả lời của bạn tại khung này và nhấn Enter để xác nhận câu trả lời' : 'Bạn không thể nhập đáp án tại thời điểm này'}
            disabled={isDisabled}
            className={`w-full p-3 rounded-lg text-lg text-black text-center shadow-sm transition duration-150 border-blue-500 border-4 bg-white disabled:bg-blue-900 disabled:cursor-not-allowed disabled:text-blue-300`}
        />
    )
}

export default PAnswerBox;
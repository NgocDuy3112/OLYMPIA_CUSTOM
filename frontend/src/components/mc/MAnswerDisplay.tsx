import React from "react";

interface MAnswerDisplayProps {
    answer: string;
    explanation?: string;
}

const MAnswerDisplay: React.FC<MAnswerDisplayProps> = ({ answer, explanation }) => {
    if (!answer) return null;
    return (
        <div className="mx-3 mt-3 flex flex-col gap-2">
            <div className="p-4 bg-green-700 border-2 border-green-400 rounded-xl text-center font-bold text-white text-xl">
                ĐÁP ÁN: {answer}
            </div>
            {explanation && (
                <div className="p-3 bg-yellow-800 border border-yellow-500 rounded-xl text-center text-yellow-100 text-base">
                    {explanation}
                </div>
            )}
        </div>
    );
};

export default MAnswerDisplay;

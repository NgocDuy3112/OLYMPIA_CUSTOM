import React, { useState } from "react";
import { RenderMedia } from "@/components/shared/RenderMedia";
import type { Question } from "@/types/question";



interface AVuotDeoClueProps {
    question: Question;
    index?: number;
    onClick?: () => Promise<'correct' | 'incorrect' | boolean>;
}



const AVuotDeoClue: React.FC<AVuotDeoClueProps> = ({ question, index = 1, onClick }) => {
    const [status, setStatus] = useState<'idle' | 'selected' | 'correct' | 'incorrect'>('idle');
    const [showPopup, setShowPopup] = useState(false);

    const handleClick = () => {
        if (status !== 'idle') return;

        setStatus('selected');

        if (!onClick) return;

        Promise.resolve(onClick())
            .then((res) => {
                if (res === 'correct' || res === true) {
                    setStatus('correct');
                    setShowPopup(true);
                } else if (res === 'incorrect' || res === false) {
                    setStatus('incorrect');
                }
            })
            .catch(() => {
                setStatus('incorrect');
            });
    };

    const bgClass =
        status === 'idle'
            ? 'bg-blue-900'
            : status === 'selected'
            ? 'bg-blue-600'
            : status === 'incorrect'
            ? 'bg-black-900'
            : 'bg-blue-600';

    return (
        <>
            <div
                role="button"
                tabIndex={0}
                onClick={handleClick}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && handleClick()}
                className={`p-4 rounded-xl w-20 h-20 flex items-center justify-center text-white font-bold cursor-pointer shadow ${bgClass}`}
                aria-pressed={status !== 'idle'}
            >
                {status === 'incorrect' ? <span className="text-2xl">✕</span> : <span className="text-2xl">{index}</span>}
            </div>

            {showPopup && (
                <div className="fixed inset-0 z-50 flex items-center justify-center">
                    <div className="absolute inset-0 bg-black/50" onClick={() => setShowPopup(false)} />
                    <div className="relative bg-white rounded-xl p-6 max-w-lg w-full shadow-lg">
                        <button
                            className="absolute top-3 right-3 text-gray-600"
                            onClick={() => setShowPopup(false)}
                            aria-label="Close clue"
                        >
                            ✕
                        </button>

                        {question.questionMediaURL ? (
                            <div>{RenderMedia(question.questionMediaURL)}</div>
                        ) : (
                            <div className="text-gray-800">{question.questionExplanation ?? 'No clue available.'}</div>
                        )}
                    </div>
                </div>
            )}
        </>
    );
};

export default AVuotDeoClue;
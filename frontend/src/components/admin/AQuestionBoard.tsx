import React from "react";
import { RenderMedia } from "@/components/shared/RenderMedia";
import type { Question } from "@/types/question";


interface AQuestionBoardProps {
    title: string;
    question: Question;
    timerDuration: number;
}


const AQuestionBoard: React.FC<AQuestionBoardProps> = ({ title, question, timerDuration }) => {
    return (
        <div className="p-5 rounded-xl max-h-112.5 flex flex-col bg-blue-900 ring-4 ring-blue-600 shadow-xl">
            <div className="flex justify-between items-center pb-1">
                <p className="text-4xl font-[SVN-Gratelos_Display] font-extrabold text-blue-300 uppercase">
                    {title}
                </p>
                <div className="text-5xl font-[SVN-Gratelos_Display] font-extrabold px-3 py-1 transition-colors duration-500 text-white" >
                    {timerDuration.toString().padStart(2, '0')}
                </div>
            </div>
            <div className="flex flex-row">
                {question.questionMediaURL ? (
                    <>
                        <p className="flex flex-2 text-lg sm:text-[20px] font-bold text-white leading-relaxed text-left pt-5">
                            {question.questionText}
                        </p>
                        <div className="flex flex-1">
                            {RenderMedia(question.questionMediaURL)}
                        </div>
                    </>
                ) : (
                    <p className="flex text-lg sm:text-[20px] font-bold text-white leading-relaxed text-left pt-5">
                        {question.questionText}
                    </p>
                )
            }
            </div>
                <div className={`flex flex-col bg-blue-900 ring-blue-600 ring-4 ${question.questionExplanation ? "min-h-20": "min-h-40" } rounded-xl text-white font-extrabold items-center p-5`}>
                <div className="text-2xl justify-center">
                    {question.questionAnswer}
                </div>
                <div className="text-sm">
                    {question.questionExplanation}
                </div>
            </div>

        </div>
    )
}


export default AQuestionBoard;
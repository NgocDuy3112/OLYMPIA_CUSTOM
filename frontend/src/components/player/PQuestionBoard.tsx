import React from "react";
import { RenderMedia } from "@/components/shared/RenderMedia";
import type { Question } from "@/types/question";
import type { PlayerQuestionBoardControls } from "@/types/questionBoardTypes";


interface PQuestionBoardProps {
    title: string;
    question: Question;
    timerDuration: number;
    controls?: PlayerQuestionBoardControls;
    // optional custom content to render in the controls area (not a render-prop)
    children?: React.ReactNode;
    /** Tailwind height class applied to the board container. Defaults to h-[40vh]. */
    boardHeightClass?: string;
}


const PQuestionBoard: React.FC<PQuestionBoardProps> = ({ title, question, timerDuration, controls, children, boardHeightClass = "h-[40vh]" }) => {
    const variant = controls?.variant ?? "numbers";
    const count = controls?.count ?? (variant === "numbers" ? 6 : controls?.subjects?.length ?? 4);
    const activeIndices = controls?.activeIndices ?? [];
    const boxStates = Array.from({ length: count }).map((_, i) => activeIndices.includes(i));

    const renderDefaultControls = () => (
        <div className="flex gap-2">
            {variant === "numbers" ? (
                boxStates.map((on, idx) => {
                    const active = on;
                    return (
                        <div
                            key={idx}
                            aria-pressed={active}
                            aria-label={`control-${idx + 1}`}
                            className={`w-10 h-10 flex items-center justify-center rounded-md text-sm font-bold transition-colors duration-150 ${active ? 'bg-blue-300 text-blue-900 border border-blue-200' : 'bg-transparent border border-blue-600 text-white'}`}
                        >
                            {idx + 1}
                        </div>
                    );
                })
            ) : (
                Array.from({ length: count }).map((_, idx) => {
                    const active = boxStates[idx];
                    const subject = controls?.subjects?.[idx] ?? "";
                    const words = subject.split(/\s+/).filter(Boolean).slice(0, 4);
                    const line1 = (words[0] ?? "") + (words[1] ? ` ${words[1]}` : "");
                    const line2 = (words[2] ?? "") + (words[3] ? ` ${words[3]}` : "");
                    const score = controls?.scores?.[idx] ?? 0;
                    return (
                        <div
                            key={idx}
                            className={`flex items-center gap-4 px-3 py-2 rounded-xl transition-colors duration-150 ${active ? 'bg-blue-300 text-blue-900 border border-blue-200' : 'bg-blue-800 text-white border border-blue-600'}`}
                        >
                            <div className="text-3xl font-extrabold w-16 text-left">
                                {score}
                            </div>
                            <div className="text-right text-sm leading-tight">
                                <div>{line1}</div>
                                <div>{line2}</div>
                            </div>
                        </div>
                    );
                })
            )}
        </div>
    );

    return (
        <div className={`p-5 rounded-xl flex flex-col bg-blue-900 border-2 border-blue-600 shadow-xl gap-4 ${boardHeightClass}`}>
            <div className="flex justify-between items-center pb-1">
                <p className="text-4xl font-[SVN-Gratelos_Display] font-extrabold text-blue-300 uppercase">
                    {title}
                </p>
                <div className="flex items-center gap-4">
                    <div className="flex gap-2 shrink-0">
                        {children ? <>{children}</> : renderDefaultControls()}
                    </div>
                    <div className="text-5xl font-[SVN-Gratelos_Display] font-extrabold px-3 py-1 transition-colors duration-500 text-white w-20 text-center shrink-0">
                        {timerDuration.toString().padStart(2, '0')}
                    </div>
                </div>
            </div>

            <div className="flex flex-row flex-1 gap-4">
                {question.questionMediaURL ? (
                    <>
                        <div className="flex-1 flex flex-col justify-start">
                            <p className="text-lg sm:text-[20px] font-bold text-white leading-relaxed text-left">
                                {question.questionText}
                            </p>
                        </div>
                        <div className="flex-1 flex items-center justify-center">
                            <RenderMedia mediaUrl={question.questionMediaURL} />
                        </div>
                    </>
                ) : (
                    <p className="w-full text-lg sm:text-[20px] font-bold text-white leading-relaxed text-left self-start">
                        {question.questionText}
                    </p>
                )}
            </div>
        </div>
    )
}


export default PQuestionBoard;

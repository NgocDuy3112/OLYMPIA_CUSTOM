import React, { useEffect, useState } from "react";
import { RenderMedia } from "@/components/shared/RenderMedia";
import type { Question } from "@/types/question";
import type { AdminQuestionBoardControls, ControlsRenderApi } from "@/types/questionBoardTypes";

interface AQuestionBoardProps {
    title: string;
    question: Question;
    timerDuration: number;
    /** Optional node rendered next to the title in the header (e.g. dropdown) */
    titleExtra?: React.ReactNode;
    controls?: AdminQuestionBoardControls;
    // children must be a render-prop that receives control APIs
    children?: (api: ControlsRenderApi) => React.ReactNode;
    /** Tailwind height class applied to the board container. Defaults to h-[50vh]. */
    boardHeightClass?: string;
    /** Tailwind height class applied to the answer/explanation box. Defaults to h-24. */
    answerBoxHeightClass?: string;
    /** When true, hides the answer/explanation box (e.g. while timer is running) */
    hideAnswerBox?: boolean;
    videoPlayState?: "playing" | "paused" | null;
}


const AQuestionBoard: React.FC<AQuestionBoardProps> = ({ title, question, timerDuration, controls, children,     boardHeightClass = "h-[50vh]", answerBoxHeightClass = "min-h-[4rem]", hideAnswerBox = false, titleExtra, videoPlayState }) => {
    const variant = controls?.variant ?? "numbers";
    const count = controls?.count ?? (variant === "numbers" ? 6 : controls?.subjects?.length ?? 4);
    const [boxStates, setBoxStates] = useState<boolean[]>(() => Array(count).fill(false));

    useEffect(() => {
        // Reset button states when question or controls change
        setBoxStates(Array(count).fill(false));
    }, [question.questionCode, count]);

    const toggleBox = (index: number) => {
        setBoxStates((prev) => {
            const next = [...prev];
            next[index] = !next[index];
            controls?.onToggle?.(index, next[index]);
            return next;
        });
    };

    const renderDefaultControls = () => (
        <div className="flex gap-2">
            {variant === "numbers" ? (
                boxStates.map((on, idx) => {
                    const active = controls?.activeIndices?.includes(idx) ?? on;
                    return (
                        <button
                            key={idx}
                            type="button"
                            aria-pressed={active}
                            aria-label={`control-${idx + 1}`}
                            onClick={() => toggleBox(idx)}
                            className={`w-8 h-8 tablet:w-10 tablet:h-10 flex items-center justify-center rounded-md text-xs tablet:text-sm font-bold transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${active ? 'bg-blue-300 text-blue-900 border border-blue-200' : 'bg-transparent border border-blue-600 text-white hover:bg-blue-700'}`}
                        >
                            {idx + 1}
                        </button>
                    );
                })
            ) : (
                // subjects variant: render larger rectangles with score and two-line subject name
                Array.from({ length: count }).map((_, idx) => {
                    const active = controls?.activeIndices?.includes(idx) ?? boxStates[idx];
                    const subject = controls?.subjects?.[idx] ?? "";
                    const words = subject.split(/\s+/).filter(Boolean).slice(0, 4);
                    const line1 = (words[0] ?? "") + (words[1] ? ` ${words[1]}` : "");
                    const line2 = (words[2] ?? "") + (words[3] ? ` ${words[3]}` : "");
                    const score = controls?.scores?.[idx] ?? 0;
                    return (
                        <button
                            key={idx}
                            type="button"
                            aria-pressed={active}
                            onClick={() => toggleBox(idx)}
                            className={`flex items-center gap-4 px-3 py-2 rounded-xl transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${active ? 'bg-blue-300 text-blue-900 border border-blue-200' : 'bg-blue-800 text-white border border-blue-600 hover:bg-blue-700'}`}
                        >
                            <div className="text-2xl tablet:text-3xl font-extrabold w-12 tablet:w-16 text-left">
                                {score}
                            </div>
                            <div className="text-right text-sm leading-tight">
                                <div>{line1}</div>
                                <div>{line2}</div>
                            </div>
                        </button>
                    );
                })
            )}
        </div>
    );

    return (
        <div className={`p-2 tablet:p-3 xl:p-5 rounded-xl flex flex-col bg-blue-900 border-2 border-blue-600 shadow-xl gap-2 tablet:gap-3 xl:gap-4 ${boardHeightClass}`}>
            {/* Header: title, timer and six control boxes */}
            <div className="flex justify-between items-center pb-1">
                <div className="flex items-center gap-4">
                    <p className="text-lg tablet:text-xl xl:text-4xl font-[SVN-Gratelos_Display] font-extrabold text-blue-300 uppercase">
                        {title}
                    </p>
                    {titleExtra && <div className="ml-2">{titleExtra}</div>}
                </div>
                <div className="flex items-center gap-4">
                    {/* keep controls container from shrinking so timer changes don't push it */}
                    <div className="flex gap-2 shrink-0">
                        {children
                            ? children({
                                variant,
                                count,
                                boxStates,
                                activeIndices: controls?.activeIndices ?? [],
                                toggle: toggleBox,
                            })
                            : renderDefaultControls()}
                    </div>
                    {/* give timer a fixed width so its digit changes won't shift surrounding layout */}
                    <div className="text-3xl tablet:text-3xl xl:text-5xl font-[SVN-Gratelos_Display] font-extrabold px-1 tablet:px-2 xl:px-3 py-1 transition-colors duration-500 text-white w-12 tablet:w-14 xl:w-20 text-center shrink-0">
                        {timerDuration.toString().padStart(2, '0')}
                    </div>
                </div>
            </div>

            {/* Content area: question text and optional media - takes remaining space */}
            <div className="flex flex-row flex-1 gap-4">
                {question.questionMediaURL ? (
                    <>
                        {/* Left side: question text (50% width) */}
                        <div className="flex-1 flex flex-col justify-start">
                            <p className="text-lg sm:text-[20px] font-bold text-white leading-relaxed text-left">
                                {question.questionText}
                            </p>
                        </div>
                        {/* Right side: media (50% width) */}
                        <div className="flex-1 min-h-0 overflow-hidden">
                            <RenderMedia mediaUrl={question.questionMediaURL} videoPlayState={videoPlayState} />
                        </div>
                    </>
                ) : (
                    /* Full width: question text only */
                    <p className="w-full text-lg sm:text-[20px] font-bold text-white leading-relaxed text-left self-start">
                        {question.questionText}
                    </p>
                )}
            </div>

            {/* Answer box — hidden during timer */}
            {!hideAnswerBox && (
                <div className={`flex flex-col bg-blue-800 border border-blue-600 ${answerBoxHeightClass} rounded-xl text-white font-extrabold items-center justify-center p-3`}>
                    <div className="text-xl tablet:text-2xl text-center line-clamp-3">
                        {question.questionAnswer}
                    </div>
                </div>
            )}
        </div>
    )
}


export default AQuestionBoard;
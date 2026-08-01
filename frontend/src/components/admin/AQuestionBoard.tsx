import React, { useEffect, useState } from "react";
import { RenderMedia } from "@/components/shared/RenderMedia";
import type { Question } from "@/types/question";
import type { AdminQuestionBoardControls, ControlsRenderApi } from "@/types/questionBoardTypes";

interface AQuestionBoardProps {
    title: string;
    question: Question;
    timerDuration: number;

    titleExtra?: React.ReactNode;
    controls?: AdminQuestionBoardControls;

    children?: (api: ControlsRenderApi) => React.ReactNode;

    boardHeightClass?: string;

    hideContent?: boolean;
    videoPlayState?: "playing" | "paused" | null;

    hideMediaUntilPlayed?: boolean;
}

const AQuestionBoard: React.FC<AQuestionBoardProps> = ({ title, question, timerDuration, controls, children,     boardHeightClass = "h-[60vh]", hideContent = false, titleExtra, videoPlayState, hideMediaUntilPlayed }) => {
    const variant = controls?.variant ?? "numbers";
    const count = controls?.count ?? (variant === "numbers" ? 6 : controls?.subjects?.length ?? 4);
    const [boxStates, setBoxStates] = useState<boolean[]>(() => Array(count).fill(false));

    useEffect(() => {

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

    const renderDefaultControls = () => {
        if (count === 0) return null;
        return (
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
    };

    const renderTitle = (t: string) => {
        const parts = t.split(" - ");
        if (parts.length >= 2) {
            return (
                <div className="flex flex-col leading-tight">
                    <span className="text-lg tablet:text-xl xl:text-4xl font-[SVN-Gratelos_Display] font-extrabold text-blue-300 uppercase">
                        {parts[0]}
                    </span>
                    <span className="text-sm tablet:text-base xl:text-2xl font-[SVN-Gratelos_Display] font-extrabold text-blue-300 uppercase">
                        {parts.slice(1).join(" - ")}
                    </span>
                </div>
            );
        }
        return <span>{t}</span>;
    };

    const containerHeightClass = hideContent ? "" : boardHeightClass;

    return (
        <div className={`p-2 tablet:p-3 xl:p-5 rounded-xl flex flex-col bg-blue-900 border-2 border-blue-600 shadow-xl gap-2 tablet:gap-3 xl:gap-4 ${containerHeightClass}`}>
            {}
            <div className="flex justify-between items-center pb-1">
                <div className="flex items-center gap-4">
                    <div className="text-lg tablet:text-xl xl:text-4xl font-[SVN-Gratelos_Display] font-extrabold text-blue-300 uppercase">
                        {renderTitle(title)}
                    </div>
                    {titleExtra && <div className="ml-2">{titleExtra}</div>}
                </div>
                <div className="flex items-center gap-4">
                    {}
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
                    {}
                    <div className="text-3xl tablet:text-3xl xl:text-5xl font-[SVN-Gratelos_Display] font-extrabold px-1 tablet:px-2 xl:px-3 py-1 transition-colors duration-500 text-white w-12 tablet:w-14 xl:w-20 text-center shrink-0">
                        {timerDuration.toString().padStart(2, '0')}
                    </div>
                </div>
            </div>

            {}
            {!hideContent && (
            <div className="flex flex-col lg:flex-row flex-1 gap-4 min-h-0 overflow-hidden">
                {question.questionMediaURL ? (
                    <>
                        {}
                        <div className="w-full lg:flex-[3] flex flex-col justify-start min-h-0 overflow-y-auto">
                            <p className="text-sm tablet:text-lg xl:text-[20px] font-bold text-white leading-relaxed text-left break-words">
                                {question.questionText}
                            </p>
                        </div>
                        {}
                        <div className="w-full lg:flex-[7] aspect-video lg:aspect-auto lg:h-full min-h-0 overflow-hidden">
                            {

}
                            <div className={hideMediaUntilPlayed && videoPlayState == null ? "h-full w-full overflow-hidden opacity-0 pointer-events-none absolute -z-10" : "h-full w-full overflow-hidden"}>
                                <RenderMedia mediaUrl={question.questionMediaURL} videoPlayState={videoPlayState} />
                            </div>
                        </div>
                    </>
                ) : (

                    <div className="w-full overflow-y-auto min-h-0">
                        <p className="text-sm tablet:text-lg xl:text-[20px] font-bold text-white leading-relaxed text-left break-words">
                            {question.questionText}
                        </p>
                    </div>
                )}
            </div>
            )}

        </div>
    )
}

export default AQuestionBoard;
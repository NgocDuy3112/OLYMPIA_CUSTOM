import React from "react";
import { RenderMedia } from "@/components/shared/RenderMedia";
import type { Question } from "@/types/question";

export type QuestionCardMode = "admin" | "player" | "mc" | "overlay";

interface QuestionCardProps {
  question: Question;
  mode: QuestionCardMode;
  timerDuration?: number;
  showAnswer?: boolean;
  media?: string;
  videoPlayState?: "playing" | "paused" | null;
  hideMediaUntilPlayed?: boolean;
  title?: string;
  controls?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}

export const QuestionCard: React.FC<QuestionCardProps> = ({
  question,
  mode,
  timerDuration,
  showAnswer = false,
  media,
  videoPlayState,
  hideMediaUntilPlayed = false,
  title,
  controls,
  children,
  className = "",
}) => {
  const isOverlay = mode === "overlay";
  const mediaUrl = media || question.questionMediaURL;

  // Title rendering
  const renderTitle = (t: string) => {
    const parts = t.split(" - ");
    if (parts.length >= 2) {
      return (
        <div className="flex flex-col leading-tight">
          <span className={`
            font-[SVN-Gratelos_Display] font-extrabold uppercase truncate
            ${isOverlay ? "text-2xl sm:text-3xl" : "text-base sm:text-lg md:text-xl xl:text-4xl"}
            ${isOverlay ? "text-white" : "text-blue-300"}
          `}>
            {parts[0]}
          </span>
          <span className={`
            font-[SVN-Gratelos_Display] font-extrabold uppercase truncate
            ${isOverlay ? "text-lg sm:text-xl" : "text-xs sm:text-sm md:text-base xl:text-2xl"}
            ${isOverlay ? "text-white/80" : "text-blue-300"}
          `}>
            {parts.slice(1).join(" - ")}
          </span>
        </div>
      );
    }
    return (
      <span className={`
        font-[SVN-Gratelos_Display] font-extrabold uppercase truncate
        ${isOverlay ? "text-2xl sm:text-3xl" : "text-base sm:text-lg md:text-xl xl:text-4xl"}
        ${isOverlay ? "text-white" : "text-blue-300"}
      `}>
        {t}
      </span>
    );
  };

  return (
    <div className={`
      rounded-xl flex flex-col gap-2 sm:gap-3 p-3 sm:p-4
      ${isOverlay
        ? "bg-transparent"
        : "bg-blue-900 border-2 border-blue-600 shadow-xl"
      }
      ${className}
    `}>
      {/* Header: Title + Controls + Timer */}
      <div className="flex justify-between items-center pb-1 gap-2 min-w-0">
        {/* Title */}
        {title && (
          <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1">
            {renderTitle(title)}
          </div>
        )}

        {/* Right side: Controls + Timer */}
        <div className="flex items-center gap-2 sm:gap-4 shrink-0">
          {/* Controls */}
          {controls && (
            <div className="flex gap-1 sm:gap-2">
              {controls}
            </div>
          )}

          {/* Timer */}
          {timerDuration !== undefined && (
            <div className={`
              font-[SVN-Gratelos_Display] font-extrabold px-2 py-1 sm:px-3
              transition-colors duration-500 text-center shrink-0
              ${isOverlay
                ? "text-4xl sm:text-5xl text-white w-16 sm:w-20"
                : "text-2xl sm:text-3xl md:text-4xl xl:text-5xl text-white w-10 sm:w-12 md:w-16 xl:w-20"
              }
            `}>
              {timerDuration.toString().padStart(2, "0")}
            </div>
          )}
        </div>
      </div>

      {/* Content: Question + Media */}
      <div className={`
        flex flex-col lg:flex-row flex-1 gap-3 sm:gap-4 min-h-0 overflow-hidden
      `}>
        {mediaUrl ? (
          <>
            {/* Question text */}
            <div className="w-full lg:flex-[3] flex flex-col justify-start min-h-0 overflow-y-auto">
              <p className={`
                font-bold leading-relaxed text-left break-words
                ${isOverlay
                  ? "text-lg sm:text-xl md:text-2xl text-white"
                  : "text-xs sm:text-sm md:text-base lg:text-lg xl:text-[20px] text-white"
                }
              `}>
                {question.questionText}
              </p>
            </div>

            {/* Media */}
            <div className="w-full lg:flex-[7] aspect-video lg:aspect-auto lg:h-full min-h-0 overflow-hidden">
              <div className={hideMediaUntilPlayed && videoPlayState == null
                ? "h-full w-full overflow-hidden opacity-0 pointer-events-none absolute -z-10"
                : "h-full w-full overflow-hidden"
              }>
                <RenderMedia mediaUrl={mediaUrl} videoPlayState={videoPlayState} />
              </div>
            </div>
          </>
        ) : (
          <div className="w-full overflow-y-auto min-h-0">
            <p className={`
              font-bold leading-relaxed text-left break-words
              ${isOverlay
                ? "text-xl sm:text-2xl md:text-3xl text-white"
                : "text-xs sm:text-sm md:text-base lg:text-lg xl:text-[20px] text-white"
              }
            `}>
              {question.questionText}
            </p>
          </div>
        )}
      </div>

      {/* Answer (only for admin/mc when showAnswer is true) */}
      {showAnswer && question.questionAnswer && mode !== "overlay" && (
        <div className="mt-2 sm:mt-4 p-2 sm:p-3 bg-green-600/20 border border-green-500 rounded-lg">
          <p className="text-green-400 font-bold text-xs sm:text-sm">
            Đáp án: {question.questionAnswer}
          </p>
        </div>
      )}

      {/* Children slot */}
      {children}
    </div>
  );
};

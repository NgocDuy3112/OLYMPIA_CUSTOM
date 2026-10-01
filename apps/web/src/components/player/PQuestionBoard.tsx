import React from "react";
import { QuestionContent } from "@/components/shared/QuestionContent";
import { Button } from "@/components/ui/button";
import type { Question } from "@/types/question";
import type { PlayerQuestionBoardControls } from "@/types/questionBoardTypes";

interface PQuestionBoardProps {
  title: string;
  question: Question;
  timerDuration: number;
  controls?: PlayerQuestionBoardControls;

  children?: React.ReactNode;

  boardHeightClass?: string;
  videoPlayState?: "playing" | "paused" | null;

  hideMediaUntilPlayed?: boolean;

  hideContent?: boolean;
  questionSelect?: (index: number) => void;
  answeredIndices?: Set<number>;
}

const PQuestionBoard: React.FC<PQuestionBoardProps> = ({
  title,
  question,
  timerDuration,
  controls,
  children,
  boardHeightClass = "h-[60vh]",
  videoPlayState,
  hideMediaUntilPlayed,
  hideContent = false,
  questionSelect,
  answeredIndices = new Set(),
}) => {
  const variant = controls?.variant ?? "numbers";
  const count =
    controls?.count ??
    (variant === "numbers" ? 6 : (controls?.subjects?.length ?? 4));
  const activeIndices = controls?.activeIndices ?? [];
  const boxStates = Array.from({ length: count }).map((_, i) =>
    activeIndices.includes(i),
  );

  const renderDefaultControls = () => (
    <div className="flex gap-2">
      {variant === "numbers"
        ? boxStates.map((on, idx) => {
            const active = on;
            return (
              <Button
                key={idx}
                type="button"
                variant="ghost"
                aria-pressed={active}
                aria-label={`control-${idx + 1}`}
                onClick={() => questionSelect?.(idx)}
                className={`w-10 h-10 flex items-center justify-center rounded-md text-sm font-bold transition-colors duration-150 ${active ? "bg-brand text-background border border-brand" : answeredIndices.has(idx) ? "bg-success text-success-foreground border border-success" : "bg-transparent border border-primary text-foreground"} ${questionSelect ? "cursor-pointer hover:bg-primary/60" : ""}`}
              >
                {idx + 1}
                {answeredIndices.has(idx) ? " ✓" : ""}
              </Button>
            );
          })
        : Array.from({ length: count }).map((_, idx) => {
            const active = boxStates[idx];
            const subject = controls?.subjects?.[idx] ?? "";
            const words = subject.split(/\s+/).filter(Boolean).slice(0, 4);
            const line1 = (words[0] ?? "") + (words[1] ? ` ${words[1]}` : "");
            const line2 = (words[2] ?? "") + (words[3] ? ` ${words[3]}` : "");
            const score = controls?.scores?.[idx] ?? 0;
            return (
              <div
                key={idx}
                className={`flex items-center gap-4 px-3 py-2 rounded-xl transition-colors duration-150 ${active ? "bg-brand text-background border border-brand" : "bg-primary/60 text-primary-foreground border border-primary"}`}
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
          })}
    </div>
  );

  const renderTitle = (t: string) => {
    const parts = t.split(" - ");
    if (parts.length >= 2) {
      return (
        <div className="flex flex-col leading-tight">
          <span className="text-xl sm:text-2xl lg:text-4xl font-display font-extrabold text-brand uppercase truncate">
            {parts[0]}
          </span>
          <span className="text-sm sm:text-base lg:text-2xl font-display font-extrabold text-brand uppercase truncate">
            {parts.slice(1).join(" - ")}
          </span>
        </div>
      );
    }
    return <span>{t}</span>;
  };

  return (
    <div
      className={`p-2 sm:p-3 lg:p-5 rounded-xl flex flex-col bg-primary/40 border-2 border-primary shadow-xl gap-2 sm:gap-3 lg:gap-4 ${boardHeightClass}`}
    >
      <div className="flex justify-between items-center pb-1 gap-2 min-w-0">
        <div className="text-xl sm:text-2xl lg:text-4xl font-display font-extrabold text-brand uppercase truncate">
          {renderTitle(title)}
        </div>
        <div className="flex items-center gap-2 sm:gap-4 shrink-0">
          <div className="flex gap-2 shrink-0">
            {children ? <>{children}</> : renderDefaultControls()}
          </div>
          <div className="text-3xl sm:text-4xl lg:text-5xl font-display font-extrabold px-2 sm:px-3 py-1 transition-colors duration-500 text-foreground w-12 sm:w-16 lg:w-20 text-center shrink-0">
            {timerDuration.toString().padStart(2, "0")}
          </div>
        </div>
      </div>

      {!hideContent && (
        <div className="flex flex-col lg:flex-row flex-1 gap-4 min-h-0 overflow-hidden">
          <QuestionContent
            question={question}
            videoPlayState={videoPlayState}
            hideMediaUntilPlayed={hideMediaUntilPlayed}
            textSizeClass="text-sm sm:text-lg lg:text-[20px]"
          />
        </div>
      )}
    </div>
  );
};

export default PQuestionBoard;

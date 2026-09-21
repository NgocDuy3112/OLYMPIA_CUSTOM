import React from "react";
import { RenderMedia } from "@/components/shared/RenderMedia";
import { MathText } from "@/components/shared/MathText";
import type { Question } from "@/types/question";

interface QuestionContentProps {
  question: Question;
  videoPlayState?: "playing" | "paused" | null;
  hideMediaUntilPlayed?: boolean;
  textSizeClass?: string;
}

/**
 * Khối render nội dung câu hỏi dùng chung cho C/PQuestionBoard:
 * text (MathText) + media (RenderMedia), layout 3/7 khi có media.
 */
export const QuestionContent: React.FC<QuestionContentProps> = ({
  question,
  videoPlayState,
  hideMediaUntilPlayed,
  textSizeClass = "text-sm tablet:text-lg xl:text-[20px]",
}) => {
  if (!question.questionMediaURL) {
    return (
      <div className="w-full overflow-y-auto min-h-0">
        <p
          className={`${textSizeClass} font-bold text-white leading-relaxed text-left break-words`}
        >
          <MathText text={question.questionText} />
        </p>
      </div>
    );
  }
  return (
    <>
      <div className="w-full lg:flex-[3] flex flex-col justify-start min-h-0 overflow-y-auto">
        <p
          className={`${textSizeClass} font-bold text-white leading-relaxed text-left break-words`}
        >
          <MathText text={question.questionText} />
        </p>
      </div>
      <div className="w-full lg:flex-[7] aspect-video lg:aspect-auto lg:h-full min-h-0 overflow-hidden">
        <div
          className={
            hideMediaUntilPlayed && videoPlayState == null
              ? "h-full w-full overflow-hidden opacity-0 pointer-events-none absolute -z-10"
              : "h-full w-full overflow-hidden"
          }
        >
          <RenderMedia
            mediaUrl={question.questionMediaURL}
            videoPlayState={videoPlayState}
          />
        </div>
      </div>
    </>
  );
};

export default QuestionContent;

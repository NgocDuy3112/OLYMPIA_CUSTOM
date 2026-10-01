import React from "react";

interface MAnswerDisplayProps {
  answer: string;
  explanation?: string;
}

const MAnswerDisplay: React.FC<MAnswerDisplayProps> = ({
  answer,
  explanation,
}) => {
  if (!answer) return null;
  return (
    <div className="mx-3 mt-3 flex flex-col gap-2">
      <div className="p-4 bg-primary/70 border-2 border-brand rounded-xl text-center font-bold text-foreground text-xl">
        {answer}
      </div>
      {explanation && (
        <div className="p-3 bg-white-800 border border-white-500 rounded-xl text-center text-foreground-100 text-base">
          {explanation}
        </div>
      )}
    </div>
  );
};

export default MAnswerDisplay;

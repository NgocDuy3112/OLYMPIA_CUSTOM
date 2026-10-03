import React, { useState } from "react";
import { RenderMedia } from "@/components/shared/RenderMedia";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Question } from "@/types/question";

interface CVuotDeoClueProps {
  question: Question;
  index?: number;
  onClick?: () => Promise<"correct" | "incorrect" | boolean>;
}

const CVuotDeoClue: React.FC<CVuotDeoClueProps> = ({
  question,
  index = 1,
  onClick,
}) => {
  const [status, setStatus] = useState<
    "idle" | "selected" | "correct" | "incorrect"
  >("idle");
  const [showPopup, setShowPopup] = useState(false);

  const handleClick = () => {
    if (status !== "idle") return;

    setStatus("selected");

    if (!onClick) return;

    Promise.resolve(onClick())
      .then((res) => {
        if (res === "correct" || res === true) {
          setStatus("correct");
          setShowPopup(true);
        } else if (res === "incorrect" || res === false) {
          setStatus("incorrect");
        }
      })
      .catch(() => {
        setStatus("incorrect");
      });
  };

  const bgClass =
    status === "idle"
      ? "bg-primary/40"
      : status === "selected"
        ? "bg-primary"
        : status === "incorrect"
          ? "bg-black-900"
          : "bg-primary";

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && handleClick()}
        className={`p-4 rounded-xl w-20 h-16 flex items-center justify-center text-foreground font-bold cursor-pointer shadow ${bgClass}`}
        aria-pressed={status !== "idle"}
      >
        {status === "incorrect" ? (
          <span className="text-2xl">✕</span>
        ) : (
          <span className="text-2xl">{index}</span>
        )}
      </div>

      <Dialog
        open={showPopup}
        onOpenChange={(v) => {
          if (!v) setShowPopup(false);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Gợi ý</DialogTitle>
          </DialogHeader>
          {question.questionMediaURL ? (
            <RenderMedia mediaUrl={question.questionMediaURL} />
          ) : (
            <p className="text-foreground">
              {question.questionExplanation ?? "No clue available."}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default CVuotDeoClue;

import type { ReactNode } from "react";
import AdminGameplayNavBar from "@/navigation/ANavBar";
import VeDichQuestionCard from "@/components/shared/VeDichQuestionCard";
import type { Question } from "@/types/question";
interface AVeDichPickLayoutProps {
  title: string;
  maxQuestions: number;

  questions: Question[];
  categories: string[];
  points: number[];

  selectedQuestionCodes: string[];
  onQuestionSelect?: (questionCode: string) => void;
  canSelectQuestions?: boolean;

  disabledQuestionCodes?: string[];
  questionStates?: Record<string, "answered" | "answered-wrong" | "available">;

  topControlButtons: ReactNode;

  bottomActionButtons: ReactNode;

  statusMessages?: ReactNode;

  renderPlayerList: () => ReactNode;
}

const AVeDichPickLayout = ({
  title,
  maxQuestions,
  questions,
  categories,
  points,
  selectedQuestionCodes,
  onQuestionSelect,
  disabledQuestionCodes = [],
  canSelectQuestions = true,
  questionStates = {},
  topControlButtons,
  bottomActionButtons,
  statusMessages,
  renderPlayerList,
}: AVeDichPickLayoutProps) => {
  const canSelectMore = selectedQuestionCodes.length < maxQuestions;

  const getQuestionState = (
    questionCode: string,
  ): "answered" | "answered-wrong" | "available" => {
    return questionStates[questionCode] || "available";
  };

  const isQuestionDisabled = (questionCode: string): boolean => {
    return disabledQuestionCodes.includes(questionCode);
  };

  const isQuestionSelected = (questionCode: string): boolean => {
    return selectedQuestionCodes.includes(questionCode);
  };

  const handleQuestionClick = (questionCode: string) => {
    if (!canSelectQuestions) return;
    if (isQuestionDisabled(questionCode)) return;

    if (isQuestionSelected(questionCode)) {
      onQuestionSelect?.(questionCode);
    } else if (canSelectMore) {
      onQuestionSelect?.(questionCode);
    }
  };

  return (
    <>
      <AdminGameplayNavBar />
      <div className="flex flex-row w-full h-screen p-3 xl:p-6 gap-4 xl:gap-8 overflow-hidden">
        {}
        <div className="flex flex-col flex-3 gap-4 xl:gap-6">
          {}
          <div className="p-3 xl:p-4 rounded-xl flex flex-col bg-blue-900 border-2 border-blue-600 shadow-xl gap-2 xl:gap-3">
            {}
            <div className="flex items-center gap-4 pb-1">
              {(() => {
                const parts = title.split(" - ");
                if (parts.length >= 2) {
                  return (
                    <div className="flex flex-col leading-tight shrink-0">
                      <span className="text-2xl xl:text-4xl font-[SVN-Gratelos_Display] font-extrabold text-blue-300 uppercase">
                        {parts[0]}
                      </span>
                      <span className="text-xl xl:text-2xl font-[SVN-Gratelos_Display] font-extrabold text-blue-300 uppercase">
                        {parts.slice(1).join(" - ")}
                      </span>
                    </div>
                  );
                }
                return (
                  <span className="text-2xl xl:text-4xl font-[SVN-Gratelos_Display] font-extrabold text-blue-300 uppercase shrink-0">
                    {title}
                  </span>
                );
              })()}

              {}
              <div className="flex-1" />

              {}
              <div className="flex gap-0.5 overflow-x-auto">
                {Array.from({ length: maxQuestions }).map((_, i) => {
                  const code = selectedQuestionCodes[i];
                  if (!code) {
                    return (
                      <div
                        key={`selected-empty-${i}`}
                        className="w-55 shrink-0 h-20"
                      >
                        <VeDichQuestionCard
                          placeholder
                          category=""
                          points={undefined}
                          disabled
                        />
                      </div>
                    );
                  }

                  const qIndex = questions.findIndex(
                    (q) => q.questionCode === code,
                  );
                  const rawCategory = categories[qIndex] || "Unknown";
                  const point = points[qIndex] || 0;
                  const [catPrimary, catSecondary] = (rawCategory || "")
                    .split("|")
                    .map((s) => s?.trim());

                  return (
                    <div
                      key={`selected-${code}`}
                      className="w-55 shrink-0 h-20"
                    >
                      <VeDichQuestionCard
                        category={catPrimary || rawCategory}
                        subcategory={catSecondary}
                        points={point}
                        state={getQuestionState(code)}
                        isSelected={true}
                        disabled={!canSelectQuestions}
                        onClick={() =>
                          canSelectQuestions && onQuestionSelect?.(code)
                        }
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            {}
            <div className="border-t border-blue-700" />

            {}
            <div
              className="grid gap-1.5"
              style={{
                gridTemplateColumns: "repeat(4, 1fr)",
                gridAutoRows: "minmax(80px, 80px)",
              }}
            >
              {Array.from({ length: 6 * 4 }).map((_, idx) => {
                const question = questions[idx];
                const rawCategory = categories[idx] || "Unknown";
                const point = points[idx] || 0;
                const [catPrimary, catSecondary] = (rawCategory || "")
                  .split("|")
                  .map((s) => s?.trim());

                if (!question) {
                  return (
                    <VeDichQuestionCard
                      key={`slot-${idx}`}
                      placeholder
                      category=""
                      points={undefined}
                      disabled
                    />
                  );
                }

                const isSelected = isQuestionSelected(question.questionCode);
                const isDisabled = isQuestionDisabled(question.questionCode);
                const state = getQuestionState(question.questionCode);

                return (
                  <VeDichQuestionCard
                    key={question.questionCode}
                    category={catPrimary || rawCategory}
                    subcategory={catSecondary}
                    points={point}
                    state={state}
                    isSelected={isSelected}
                    disabled={isDisabled}
                    onClick={() => handleQuestionClick(question.questionCode)}
                  />
                );
              })}
            </div>
          </div>

          {}
          <div className="flex flex-wrap items-center justify-center gap-3 xl:gap-4 max-w-220 mx-auto">
            {topControlButtons}
            {bottomActionButtons}
          </div>
          {statusMessages}
        </div>

        {}
        <div className="flex flex-col flex-1 gap-3 xl:gap-5 overflow-hidden pr-2">
          {renderPlayerList()}
        </div>
      </div>
    </>
  );
};

export default AVeDichPickLayout;

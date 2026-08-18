import React, { type ReactNode } from "react";
import AdminGameplayNavBar from "@/navigation/ANavBar";
import AQuestionBoard from "@/components/admin/AQuestionBoard";
import type {
  AdminQuestionBoardControls,
  ControlsRenderApi,
} from "@/types/questionBoardTypes";
import type { Question } from "@/types/question";

interface ABasePageLayoutProps {
  questionTitle: string;
  question: Question;
  timerDuration: number;

  aboveQuestionBoard?: ReactNode;

  titleExtra?: ReactNode;

  underQuestionBoard?: ReactNode;

  boardHeightClass?: string;

  hideQuestionContent?: boolean;
  videoPlayState?: "playing" | "paused" | null;
  hideMediaUntilPlayed?: boolean;

  controls?: AdminQuestionBoardControls;

  controlsChildren?: (api: ControlsRenderApi) => ReactNode;

  topControlButtons: ReactNode;

  bottomActionButtons: ReactNode;

  statusMessages?: ReactNode;

  renderPlayerList: () => ReactNode;

  playerSectionButtons?: ReactNode;
}

const ABasePageLayout: React.FC<ABasePageLayoutProps> = ({
  questionTitle,
  question,
  timerDuration,
  topControlButtons,
  bottomActionButtons,
  statusMessages,
  renderPlayerList,
  controls,
  controlsChildren,
  underQuestionBoard,
  aboveQuestionBoard,
  titleExtra,
  boardHeightClass,
  hideQuestionContent,
  playerSectionButtons,
  videoPlayState,
  hideMediaUntilPlayed,
}: ABasePageLayoutProps) => {
  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <AdminGameplayNavBar />
      <div className="flex flex-row w-full flex-1 p-2 tablet:p-3 xl:p-6 gap-3 tablet:gap-4 xl:gap-8 overflow-hidden">
        {}
        <div className="flex flex-col flex-3 gap-3 tablet:gap-4 xl:gap-6 overflow-y-auto min-w-0">
          {" "}
          {aboveQuestionBoard}
          <AQuestionBoard
            title={questionTitle}
            titleExtra={titleExtra}
            question={question}
            timerDuration={timerDuration}
            controls={controls}
            boardHeightClass={boardHeightClass}
            hideContent={hideQuestionContent}
            videoPlayState={videoPlayState}
            hideMediaUntilPlayed={hideMediaUntilPlayed}
          >
            {controlsChildren}
          </AQuestionBoard>
          {}
          {underQuestionBoard}
          <div className="flex flex-wrap items-center justify-center gap-2 tablet:gap-3 xl:gap-4 max-w-220 mx-auto">
            {topControlButtons}
            {bottomActionButtons}
          </div>
          {}
          {statusMessages}
        </div>

        {}
        <div className="flex flex-col flex-1 gap-2 tablet:gap-3 xl:gap-5 overflow-hidden">
          <div className="flex flex-col gap-2 tablet:gap-3 xl:gap-5 overflow-y-auto pr-2">
            {renderPlayerList()}
          </div>
          {playerSectionButtons && (
            <div className="flex flex-wrap items-center justify-center gap-4">
              {playerSectionButtons}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ABasePageLayout;

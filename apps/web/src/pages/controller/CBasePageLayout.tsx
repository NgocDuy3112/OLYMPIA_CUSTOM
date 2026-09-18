import React, { type ReactNode } from "react";
import CGameShell from "@/pages/controller/CGameShell";
import CQuestionBoard from "@/components/controller/CQuestionBoard";
import type {
  ControllerQuestionBoardControls,
  ControlsRenderApi,
} from "@/types/questionBoardTypes";
import type { Question } from "@/types/question";

interface CBasePageLayoutProps {
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

  controls?: ControllerQuestionBoardControls;

  controlsChildren?: (api: ControlsRenderApi) => ReactNode;

  topControlButtons: ReactNode;

  bottomActionButtons: ReactNode;

  statusMessages?: ReactNode;

  renderPlayerList: () => ReactNode;

  playerSectionButtons?: ReactNode;
}

const CBasePageLayout: React.FC<CBasePageLayoutProps> = ({
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
}: CBasePageLayoutProps) => {
  return (
    <CGameShell>
      <div className="flex flex-row w-full flex-1 p-2 tablet:p-3 xl:p-6 gap-3 tablet:gap-4 xl:gap-8 overflow-hidden">
        {}
        <div className="flex flex-col flex-3 gap-3 tablet:gap-4 xl:gap-6 overflow-y-auto min-w-0">
          {" "}
          {aboveQuestionBoard}
          <CQuestionBoard
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
          </CQuestionBoard>
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
    </CGameShell>
  );
};

export default CBasePageLayout;

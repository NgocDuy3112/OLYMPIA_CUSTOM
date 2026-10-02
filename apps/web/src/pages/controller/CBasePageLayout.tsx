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
        </div>

        <div className="flex flex-col flex-1 gap-2 tablet:gap-3 xl:gap-5 overflow-hidden">
          <div className="flex flex-col gap-2 tablet:gap-3 xl:gap-5 overflow-y-auto pr-2">
            {renderPlayerList()}
          </div>
        </div>
      </div>

      {/* Control dock — nút dồn trái, divider nhóm, status sang phải */}
      <div className="flex w-full shrink-0 flex-wrap items-center justify-start gap-2 border-t border-border bg-background/60 px-3 py-2.5 backdrop-blur sm:px-4">
        <div className="flex flex-wrap items-center justify-start gap-2">
          {topControlButtons}
          {bottomActionButtons}
        </div>
        {playerSectionButtons && (
          <>
            <span
              className="mx-1 hidden h-5 w-px bg-border sm:block"
              aria-hidden
            />
            <div className="flex flex-wrap items-center justify-start gap-2">
              {playerSectionButtons}
            </div>
          </>
        )}
        {statusMessages && (
          <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2">
            {statusMessages}
          </div>
        )}
      </div>
    </CGameShell>

  );
};

export default CBasePageLayout;

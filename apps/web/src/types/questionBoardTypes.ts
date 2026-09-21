export type ControlVariant = "numbers" | "subjects";

export interface BaseQuestionBoardControls {
  variant?: ControlVariant;
  count?: number;
  subjects?: string[];
  scores?: (number | string)[];
  activeIndices?: number[];
}

export interface ControllerQuestionBoardControls extends BaseQuestionBoardControls {
  onToggle?: (index: number, state: boolean) => void;
}

/** Alias cũ giữ cho tương thích — AQuestionBoard đã gộp vào CQuestionBoard. */
export type AdminQuestionBoardControls = ControllerQuestionBoardControls;

export type PlayerQuestionBoardControls = BaseQuestionBoardControls;

export interface ControlsRenderApi {
  variant: ControlVariant;
  count: number;
  boxStates: boolean[];
  activeIndices: number[];
  toggle: (index: number) => void;
}

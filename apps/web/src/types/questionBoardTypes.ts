
export type ControlVariant = "numbers" | "subjects";

export interface BaseQuestionBoardControls {
  variant?: ControlVariant;
  count?: number;
  subjects?: string[];
  scores?: (number | string)[];
  activeIndices?: number[];
}

export interface AdminQuestionBoardControls extends BaseQuestionBoardControls {
  onToggle?: (index: number, state: boolean) => void;
}

export type PlayerQuestionBoardControls = BaseQuestionBoardControls;

export interface ControlsRenderApi {
  variant: ControlVariant;
  count: number;
  boxStates: boolean[];
  activeIndices: number[];
  toggle: (index: number) => void;
}

// Shared types for QuestionBoard controls (separate admin/player variants)
export type ControlVariant = "numbers" | "subjects";

export interface BaseQuestionBoardControls {
  variant?: ControlVariant;
  count?: number;
  subjects?: string[]; // for 'subjects' variant - each should be up to 4 words
  scores?: (number | string)[]; // optional left-side values for subjects
  activeIndices?: number[];
}

// Admin config can include an onToggle callback used by admin UI
export interface AdminQuestionBoardControls extends BaseQuestionBoardControls {
  onToggle?: (index: number, state: boolean) => void;
}

// Player config is a read-only view of the controls (no callbacks)
export type PlayerQuestionBoardControls = BaseQuestionBoardControls;

export interface ControlsRenderApi {
  variant: ControlVariant;
  count: number;
  boxStates: boolean[];
  activeIndices: number[];
  toggle: (index: number) => void;
}

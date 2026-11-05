// The player deck's surface — the barrel the gameplay screens import from.
// The implementation is split by concern:
//
//   primitives.tsx       frame, card, header, badges, progress, timer, status, gate
//   question.tsx         the question text, media well, and the whole card
//   strip.tsx            the player's action band (+ the console strip, shared)
//   rail.tsx             the contestant cards as THIS player sees them
//   answer-controls.tsx  answer box, keyword box, power declarations
//   screen.tsx           PlayerStage — the stack every round screen ends with
//
// Components and TYPES only (fast-refresh): pure helpers live in cells.ts /
// copy.ts / types.ts and are imported from there directly.
export {
    Badges,
    CardHeader,
    Gate,
    MainCard,
    Progress,
    StageLayout,
    Timer,
    VerdictIcon,
} from "./primitives"

export { AnswerReveal, KeywordLengthBanner, QuestionFrame } from "./question"

export { VeDichStripCells } from "./strip"

export { Rail } from "./rail"

export { AnswerBand, KeywordBox } from "./answer-controls"

export { PlayerStage } from "./screen"

export type { PlayerCore, PlayerCtx } from "./types"

// The MC console's deck surface — ONE import site for the round screens.
//
//   @shared/deck/stage   the shared flow primitives, re-exported below
//   ./rail.tsx           the operator's rail card (cameras, verdicts, badges)
//   ./facts.ts           ConsoleFacts — what the orchestrator knows
//   ./screen.tsx         ConsoleStage — the stack every controller ends with
//   ./actions.ts         verdictActions / backToLobbyAction (pure plans)
//
// Components and TYPES only (fast-refresh); helpers are imported from their own
// module.
export {
    Badges,
    Band,
    CardHeader,
    KeywordLengthBanner,
    MainCard,
    Progress,
    QuestionBlock,
    QuestionFrame,
    StageLayout,
    Status,
    Strip,
    Timer,
    VeDichStripCells,
    type StripItem,
} from "@shared/deck/stage"

export { Rail, type CardData } from "./rail"

export type { ConsoleFacts } from "./facts"

export { ConsoleStage } from "./screen"

// The flow stage's surface — the barrel the console console imports from. The
// implementation is split by concern so no file is a junk drawer:
//
//   primitives.tsx     frame, card, header, badges, progress, timer, status, gate
//   question.tsx       the question text, its media well, the whole question card
//   strip.tsx          the console action strip + the vé-đích chips + the player band
//
// Screens keep importing from here (one import site), so splitting the file
// again costs nothing at the call sites. Components and TYPES only: a helper
// belongs in its own module (see cells.ts, copy.ts) — that is what keeps this
// file fast-refresh clean.
export {
    Badges,
    CardHeader,
    MainCard,
    Progress,
    StageLayout,
    Status,
    Timer,
    } from "./primitives"

export { KeywordLengthBanner, QuestionBlock, QuestionFrame } from "./question"

export { Strip, VeDichStripCells, type StripItem } from "./strip"

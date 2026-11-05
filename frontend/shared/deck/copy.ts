// The deck's UI copy — every string that appears on BOTH surfaces (console + player)
// or more than once within one surface. Wording fixes happen here, once: a
// screen never spells a control twice, and a rename can't leave one deck saying
// "Về sảnh" while the other still says "Thoát".
//
// Round names live in `geometry.ts` (ROUND_LABEL) — they are labels of the
// RULES, not of a control.

export const COPY = {
    /** The verdict pair — the console's strip, the player's answer controls. */
    correct: "Đúng",
    wrong: "Sai",

    /** The console strip's round controls. */
    backToLobby: "Về sảnh",
    endTurn: "Hết lượt",
    startClock: "Tính giờ",
    judgeKeyword: "Đúng từ khoá",

    /** The player band's controls. */
    send: "Gửi",
    submit: "Nộp",
    buzz: "Bấm chuông",
    /** The power row — the console's pick-board decision (before the open). */
    powerStar: "Ngôi sao hy vọng",
    powerAssign: "Chỉ định đối kháng",
    powerNone: "Không dùng quyền năng",

    /** Shared placeholders. */
    waitingForMc: "Đang chờ điều hành…",
    noQuestion: "Không tải được câu hỏi — hỏi lại ban điều hành.",
} as const

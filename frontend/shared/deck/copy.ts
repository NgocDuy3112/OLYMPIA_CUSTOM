// The deck's UI copy — every string that appears on BOTH surfaces (MC + player)
// or more than once within one surface. Wording fixes happen here, once: a
// screen never spells a control twice, and a rename can't leave one deck saying
// "Về sảnh" while the other still says "Thoát".
//
// Round names live in `geometry.ts` (ROUND_LABEL) — they are labels of the
// RULES, not of a control.

export const COPY = {
    /** The verdict pair — the MC's strip, the player's answer controls. */
    correct: "Đúng",
    wrong: "Sai",

    /** The MC strip's round controls. */
    backToLobby: "Về sảnh",
    endTurn: "Hết lượt",
    startClock: "Tính giờ",
    judgeKeyword: "Đúng từ khoá",

    /** The player band's controls. */
    send: "Gửi",
    submit: "Nộp",
    buzz: "Bấm chuông",
    powerHope: "Hy vọng",
    powerShield: "Khiên",

    /** Shared placeholders. */
    waitingForMc: "Đang chờ MC…",
    noQuestion: "Không tải được câu hỏi — hỏi lại MC.",
} as const

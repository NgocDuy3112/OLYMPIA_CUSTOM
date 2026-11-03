// Why the player is looking at the lobby instead of a round screen.
//
// The deck shows the lobby for four different reasons, and the hint is the only
// thing that tells the player which one it is — "the round hasn't started" and
// "this round has no player screen at all" look identical otherwise, and one of
// them needs the operator called. Pure, so the wording table is unit-tested.
import { isKnownRound } from "@shared/deck/geometry"

/** The match is not LIVE yet (the live read answers 409 until it is). */
export const NOT_LIVE_HINT = "Chờ điều hành mở trận — trang tự cập nhật."

/** A round that exists but died — nothing more will happen without the console. */
const UNKNOWN_ROUND_HINT = "Vòng này chưa có màn hình thí sinh — hỏi ban điều hành."
const ENDED_HINT = "Vòng đã kết thúc — chờ điều hành chuyển vòng."
const WAITING_HINT = "Chờ điều hành bắt đầu vòng — trang tự cập nhật."

/**
 * The lobby's one-line reason.
 *
 * An unknown round (or an unknown stage) is NOT the same wait as a published
 * one: the first needs a human, the second needs the console's next press — so
 * they must never share a sentence.
 */
export function lobbyHintOf(roundId: string, stage: string): string {
    if (!isKnownRound(roundId) || stage === "unknown") return UNKNOWN_ROUND_HINT
    if (stage === "ended") return ENDED_HINT
    return WAITING_HINT
}

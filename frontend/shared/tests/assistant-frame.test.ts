import { describe, expect, it } from "vitest"
import { readAssistantFrame } from "../lib/ws"

const frame = (data: unknown) => ({ type: "assistant", data })

describe("readAssistantFrame — the assistant envelope is validated before it reaches UI state", () => {
    it("reads a delta frame", () => {
        expect(readAssistantFrame(frame({ turnId: "t1", delta: "Đã mở vòng" }))).toEqual({
            ok: true,
            frame: { turnId: "t1", delta: "Đã mở vòng" },
        })
    })

    it("reads a done frame", () => {
        expect(readAssistantFrame(frame({ turnId: "t1", done: true }))).toEqual({
            ok: true,
            frame: { turnId: "t1", done: true },
        })
    })

    it("keeps a tool call with its action untouched", () => {
        const action = { kind: "khoi-dong.start", phase: 1 }
        expect(
            readAssistantFrame(
                frame({ turnId: "t1", toolCall: { proposalId: "p1", action, rationale: "Mở vòng 1" } })
            )
        ).toEqual({
            ok: true,
            frame: { turnId: "t1", toolCall: { proposalId: "p1", action, rationale: "Mở vòng 1" } },
        })
    })

    it("rejects anything that is not an assistant envelope", () => {
        expect(readAssistantFrame(null)).toEqual({ ok: false, error: "Khung assistant không hợp lệ" })
        expect(readAssistantFrame({ type: "console", data: {} })).toEqual({
            ok: false,
            error: "Khung assistant không hợp lệ",
        })
    })

    it("rejects a payload that cannot be rendered", () => {
        expect(readAssistantFrame({ type: "assistant" })).toEqual({
            ok: false,
            error: "Khung assistant không có dữ liệu",
        })
        expect(readAssistantFrame(frame({ delta: "x" }))).toEqual({
            ok: false,
            error: "Khung assistant thiếu turnId",
        })
        expect(readAssistantFrame(frame({ turnId: "t1", delta: 1 }))).toEqual({
            ok: false,
            error: "Khung assistant có delta không hợp lệ",
        })
        expect(readAssistantFrame(frame({ turnId: "t1", done: "yes" }))).toEqual({
            ok: false,
            error: "Khung assistant có done không hợp lệ",
        })
        expect(readAssistantFrame(frame({ turnId: "t1" }))).toEqual({
            ok: false,
            error: "Khung assistant không có nội dung",
        })
    })

    it("rejects a proposal without a usable action", () => {
        expect(readAssistantFrame(frame({ turnId: "t1", toolCall: { proposalId: "p1" } }))).toEqual({
            ok: false,
            error: "Đề xuất assistant không hợp lệ",
        })
        expect(
            readAssistantFrame(frame({ turnId: "t1", toolCall: { proposalId: "p1", action: [] } }))
        ).toEqual({ ok: false, error: "Đề xuất assistant không hợp lệ" })
        expect(
            readAssistantFrame(frame({ turnId: "t1", toolCall: { proposalId: "p1", action: {} } }))
        ).toEqual({ ok: false, error: "Đề xuất assistant không hợp lệ" })
    })
})

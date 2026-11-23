import { render } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import type { PlayerCtx, PlayerView } from "@shared/deck/types"
import { GiaiMaAOCPlayer } from "@shared/deck/screens/GiaiMaAOCPlayer"
import { ButPhaAOCPlayer } from "@shared/deck/screens/ButPhaAOCPlayer"
import { KhoiDongChungAOCPlayer } from "@shared/deck/screens/KhoiDongChungAOCPlayer"
import { VeDichChungAOCPlayer } from "@shared/deck/screens/VeDichChungAOCPlayer"
import { VeDichChungPickAOCPlayer } from "@shared/deck/screens/VeDichChungPickAOCPlayer"
import { VeDichRiengPickAOCPlayer } from "@shared/deck/screens/VeDichRiengPickAOCPlayer"
import { VeDichRiengAOCPlayer } from "@shared/deck/screens/VeDichRiengAOCPlayer"
import { Rail } from "@shared/deck/player-deck"


const question = (id: string, kind: "CHOICE" | "TEXT" | "KEYWORD" = "TEXT") => ({
    questionId: id,
    kind,
    position: 1,
    questionText: `Câu hỏi ${id}`,
    media: null,
    payload: kind === "CHOICE" ? { options: [{ id: "a", text: "A" }, { id: "b", text: "B" }] } : {},
})

const board = [
    { questionId: "q20", value: 20, where: "free" as const },
    { questionId: "q30", value: 30, where: "free" as const },
    { questionId: "q40", value: 40, where: "taken" as const },
    { questionId: "q50", value: 50, where: "deferred" as const },
]

function view(over: Partial<PlayerView> = {}): PlayerView {
    return {
        matchId: "m1",
        roundId: "khoi-dong",
        version: 1,
        stage: "phase2",
        open: [],
        table: [
            { id: "u1", displayName: "An", points: 30, rank: 1 },
            { id: "u2", displayName: "Bình", points: 20, rank: 2 },
        ],
        board,
        me: { pickedTiles: [], hintVerdicts: {} },
        hintAnswers: {},
        keywordDeadlineAt: null,
        keywordLength: 7,
        keywordKind: "letters",
        ...over,
    }
}

const stubClock = { sync: () => {}, skew: () => 0 }

function ctx(over: Partial<PlayerCtx> = {}): PlayerCtx {
    const v = over.v ?? view()
    return {
        v,
        stage: v.stage,
        open: v.open,
        remaining: 12,
        oralRemaining: 12,
        clock: stubClock,
        myId: "u1",
        flash: null,
        nameOf: (id) => (id === "u1" ? "An" : "Bình"),
        s2Q: v.open[0],
        s2Idx: 0,
        pickS2: vi.fn(),
        answerBusy: false,
        submitAnswer: vi.fn(),
        keywordBusy: false,
        submitKeyword: vi.fn(),
        cmdBusy: false,
        command: vi.fn(),
        ...over,
    }
}

const openQ = {
    questionId: "q1",
    deadlineAt: null,
    question: {
        questionId: "q1",
        kind: "CHOICE" as const,
        position: 1,
        questionText: "Câu hỏi mở",
        media: null,
        payload: { options: [{ id: "a", text: "A" }, { id: "b", text: "B" }] },
    },
}

describe("player screens render from a plain fixture", () => {
    it("khởi động · lượt chung — no window yet: the field waits for Bấm giờ", () => {
        const open = view({ roundId: "khoi-dong", open: [openQ] })
        const { queryByLabelText } = render(
            <KhoiDongChungAOCPlayer ctx={ctx({ v: open, remaining: 0 })} />
        )
        expect(queryByLabelText("Câu trả lời của bạn")).toBeNull()
    })

    const windowLive = () =>
        view({
            roundId: "khoi-dong",
            open: [{ questionId: "q1", deadlineAt: null, question: question("q1") }],
            me: { windowOpen: true, questionIndex: 0, questionCount: 6, pickedTiles: [], hintVerdicts: {} } as PlayerView["me"],
        })

    it("khởi động · lượt chung — the field opens with the window", () => {
        const { getByLabelText } = render(
            <KhoiDongChungAOCPlayer ctx={ctx({ v: windowLive(), remaining: 8_000 })} />
        )
        expect(getByLabelText("Câu trả lời của bạn")).not.toBeDisabled()
    })

    it("khởi động · lượt chung — and LOCKS the moment the clock hits zero", () => {
        const { getByLabelText } = render(
            <KhoiDongChungAOCPlayer ctx={ctx({ v: windowLive(), remaining: 0 })} />
        )
        expect(getByLabelText("Câu trả lời của bạn")).toBeDisabled()
    })

    it("Đáp án thí sinh — the revealed contestant answer rides on the player card", () => {
        const v = view({
            roundId: "khoi-dong",
            open: [openQ],
            revealed: { contestants: [{ userId: "u1", name: "An", answer: "Hà Nội", verdict: "CORRECT" }] },
        })
        const { getByText, queryByText } = render(<KhoiDongChungAOCPlayer ctx={ctx({ v, remaining: 0 })} />)
        expect(getByText("Hà Nội")).toBeTruthy()
        expect(queryByText("Đáp án")).toBeNull()
    })

    it("nothing revealed → no contestant answer shows on the cards", () => {
        const v = view({ roundId: "khoi-dong", open: [openQ] })
        const { queryByText } = render(<KhoiDongChungAOCPlayer ctx={ctx({ v, remaining: 0 })} />)
        expect(queryByText("Đáp án")).toBeNull()
        expect(queryByText("Hà Nội")).toBeNull()
    })

    it("bứt phá — no open question still renders the card", () => {
        const { getByText } = render(<ButPhaAOCPlayer ctx={ctx({ v: view({ roundId: "but-pha" }) })} />)
        expect(getByText("Bứt phá")).toBeTruthy()
    })

    it("bứt phá — the stepper marks done questions with ✓ and lights the current one", () => {
        const open = {
            questionId: "bp-3",
            deadlineAt: null,
            question: { ...question("bp-3"), position: 2 },
        }
        const { getByText, container } = render(
            <ButPhaAOCPlayer ctx={ctx({ v: view({ roundId: "but-pha", open: [open] }) })} />
        )

        expect(getByText("✓1")).toBeTruthy()
        expect(getByText("✓2")).toBeTruthy()
        const current = container.querySelector('[aria-current="step"]')
        expect(current?.textContent).toBe("3")
    })

    it("giải mã — the keyword banner and the eight tiles", () => {
        const v = view({
            roundId: "giai-ma",
            keyword: { questionId: "k1", question: { ...question("k1", "KEYWORD"), payload: { codeLength: 7 } } },
        })
        const { getByText } = render(<GiaiMaAOCPlayer ctx={ctx({ v })} />)
        expect(getByText(/Mật mã gồm có 7 chữ cái/)).toBeTruthy()
        expect(getByText("Giải mã")).toBeTruthy()
    })

    it("Đáp án thí sinh — the giai mã reveal lights the answering card", () => {
        const v = view({
            roundId: "giai-ma",
            keyword: { questionId: "kw", question: null },
            revealed: { contestants: [{ userId: "u1", name: "An", answer: "CHUNGKET", verdict: null }] },
        })
        const { getByText } = render(<GiaiMaAOCPlayer ctx={ctx({ v })} />)
        expect(getByText("CHUNGKET")).toBeTruthy()
    })

    it("giải mã — the band carries BOTH boxes: the hint answer and the keyword", () => {
        const keyword = { questionId: "k1", question: question("k1", "KEYWORD") }

        const withWindow = render(
            <GiaiMaAOCPlayer
                ctx={ctx({
                    v: view({
                        roundId: "giai-ma",
                        open: [{ questionId: "q1", deadlineAt: null, question: question("q1") }],
                        keyword,
                    }),
                })}
            />
        )
        expect(withWindow.getByLabelText("Câu trả lời của bạn")).toBeTruthy()
        expect(withWindow.getByLabelText("Từ khóa của bạn")).toBeTruthy()
        withWindow.unmount()

        const withoutWindow = render(
            <GiaiMaAOCPlayer ctx={ctx({ v: view({ roundId: "giai-ma", keyword }) })} />
        )
        const idle = withoutWindow.getByLabelText("Câu trả lời của bạn") as HTMLInputElement
        expect(idle.disabled).toBe(true)
        expect(idle.placeholder).toBe("")
        expect(withoutWindow.getByLabelText("Từ khóa của bạn")).toBeTruthy()
    })

    it("giải mã — submitting the keyword asks for confirmation first", async () => {
        const user = userEvent.setup()
        const submitKeyword = vi.fn()
        const v = view({
            roundId: "giai-ma",
            keyword: { questionId: "k1", question: question("k1", "KEYWORD") },
            keywordDeadlineAt: "2099-01-01T00:00:00.000Z",
        })
        const { getByLabelText, getByRole } = render(
            <GiaiMaAOCPlayer ctx={ctx({ v, submitKeyword })} />
        )

        const input = getByLabelText("Từ khóa của bạn") as HTMLInputElement
        await user.type(input, "CHUNGKET")

        await user.click(getByRole("button", { name: "Nộp" }))
        expect(submitKeyword).not.toHaveBeenCalled()
        expect(getByRole("button", { name: "Xác nhận" })).toBeTruthy()

        await user.click(getByRole("button", { name: "Xác nhận" }))
        expect(submitKeyword).toHaveBeenCalledWith("k1", "CHUNGKET")
    })

    it("về đích · câu hỏi chung — the typed band", () => {
        const v = view({ roundId: "ve-dich", stage: "phase1", open: [openQ] })
        const { getByText } = render(<VeDichChungAOCPlayer ctx={ctx({ v })} />)
        expect(getByText("Về đích")).toBeTruthy()
    })

    it("về đích · câu hỏi chung — the strip sits in the header's right slot, beside the clock", () => {
        const v = view({
            roundId: "ve-dich",
            stage: "phase1",
            open: [openQ],
            board: [
                { questionId: "q1", value: 20, where: "open" },
                { questionId: "q2", value: 30, where: "pending" },
            ],
        })
        const { container } = render(<VeDichChungAOCPlayer ctx={ctx({ v })} />)

        // No mid slot: the strip no longer stretches across the middle.
        expect(container.querySelector(".flex-1.items-start.justify-center")).toBeNull()
        const right = container.querySelector(".flex.min-w-0.items-start.gap-\\[1\\.6cqw\\]")
        expect(right).not.toBeNull()
        expect(right?.textContent).toContain("20")
        expect(right?.textContent).toContain("30")
    })

    it("về đích · lượt cá nhân — the buzz button is this player's", () => {
        const v = view({ roundId: "ve-dich", stage: "phase2", open: [openQ], me: { canBuzz: true, buzzWindowOpen: true, pickedTiles: [], hintVerdicts: {} } as PlayerView["me"] })
        const { getAllByText } = render(<VeDichRiengAOCPlayer ctx={ctx({ v })} />)
        expect(getAllByText("Bấm chuông").length).toBeGreaterThan(0)
    })

    it("về đích · câu hỏi chung — the strip shows the whole turn, not just what waits", () => {
        const v = view({
            roundId: "ve-dich",
            stage: "phase1",
            open: [openQ],
            board: [
                { questionId: "q1", value: 20, where: "open" },
                { questionId: "q2", value: 20, where: "pending" },
                { questionId: "q3", value: 30, where: "taken" },
                { questionId: "q4", value: 30, where: "taken" },
            ],
            console: { picksConfirmed: true, turnQuestions: ["q1", "q2", "q3", "q4"], turnValues: [20, 20, 30, 30] },
        })
        const { container } = render(<VeDichChungAOCPlayer ctx={ctx({ v })} />)

        const chips = Array.from(container.querySelectorAll("button")).filter((el) =>
            el.className.includes("h-[4.43cqw]"))
        expect(chips).toHaveLength(4)
        // Same component as the console: fixed width, never stretched.
        for (const chip of chips) {
            expect(chip.className).toContain("w-[7cqw]")
            expect(chip.className).toContain("rounded-lg")
        }
    })

    it("về đích · lượt cá nhân — the strip sits in the header's right slot too", () => {        const v = view({
            roundId: "ve-dich",
            stage: "phase2",
            open: [openQ],
            board: [
                { questionId: "q1", value: 40, where: "open" },
                { questionId: "q2", value: 50, where: "pending" },
            ],
        })
        const { container } = render(<VeDichRiengAOCPlayer ctx={ctx({ v })} />)

        expect(container.querySelector(".flex-1.items-start.justify-center")).toBeNull()
        const right = container.querySelector(".flex.min-w-0.items-start.gap-\\[1\\.6cqw\\]")
        expect(right).not.toBeNull()
        expect(right?.textContent).toContain("40")
        expect(right?.textContent).toContain("50")
    })

    it("về đích · the board — a picker with the fixed bands", () => {
        const v = view({ roundId: "ve-dich", stage: "phase2", me: { isMyTurn: true, pickedTiles: [], hintVerdicts: {} } })
        const { getAllByText } = render(<VeDichRiengPickAOCPlayer ctx={ctx({ v })} />)
        expect(getAllByText("Về đích").length).toBeGreaterThan(0)
        expect(getAllByText("40").length).toBeGreaterThan(0)
    })

    it("về đích · the board — display-only: the console picks, the player watches", () => {
        const v = view({ roundId: "ve-dich", stage: "phase2", me: { isMyTurn: true, pickedTiles: [], hintVerdicts: {} } })
        const { queryByText } = render(<VeDichChungPickAOCPlayer ctx={ctx({ v })} />)
        expect(queryByText("Chốt 3 câu")).toBeNull()
        expect(queryByText("Chọn câu này")).toBeNull()
        // the status line was removed — the picked cells now sit beside the clock
    })

    it("rail — the buzzer's card reads Đã bấm chuông with the time they buzzed", () => {
        const v = view({ roundId: "ve-dich", stage: "phase2", me: { buzzer: "u2", buzzerMs: 1240, pickedTiles: [], hintVerdicts: {} } })
        const { getByText } = render(<Rail view={v} myId={null} />)
        expect(getByText(/Đã bấm chuông/)).toBeTruthy()
        expect(getByText("01.240")).toBeTruthy()
    })

    it("rail — every card carries Answer with how long they took, next to the buzz", () => {
        const v = view({
            roundId: "ve-dich",
            stage: "phase2",
            me: { buzzer: "u2", buzzerMs: 3425, pickedTiles: [], hintVerdicts: {} },
            publicVerdicts: [
                { questionId: "q1", userId: "u1", verdict: "CORRECT", answeredMs: 9002 },
                { questionId: "q1", userId: "u2", verdict: "INCORRECT", answeredMs: 4100 },
            ],
        })
        const { getByText, getAllByText } = render(
            <Rail view={v} myId={null} currentQid="q1" />
        )

        expect(getAllByText("09.002")).toHaveLength(1)
        expect(getAllByText("04.100")).toHaveLength(1)
        expect(getByText("09.002")).toBeTruthy()
        expect(getByText("04.100")).toBeTruthy()
        expect(getByText("Đã bấm chuông")).toBeTruthy()
        expect(getByText("03.425")).toBeTruthy()
    })
})


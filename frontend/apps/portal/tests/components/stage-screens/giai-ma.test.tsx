import { expect, it, describe } from "vitest"
import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import type { LiveResponse } from "@/lib/live"
import {
    expectButtonsInOrder,
    openQ,
    renderRound,
} from "../../helpers/stage-facts"

describe("GiaiMa — S3", () => {
    const BUTTON = { selector: "button" } as const

    it("commits are inert until a submitted player is selected", () => {
        renderRound("giai-ma")
        expect(screen.queryByText("Đúng", BUTTON)).toBeNull()
        expect(screen.queryByText("Đúng từ khoá", BUTTON)).toBeNull()
        expect(screen.queryByRole("button", { name: "Sai" })).toBeNull()
    })

    it("Đúng commits the hint verdicts when ready; Sai stays inert", async () => {
        const user = userEvent.setup()
        const f = renderRound("giai-ma", {
            commitHintReady: true,
            commitKeywordReady: true,
        }, { open: [openQ] })

        expectButtonsInOrder(["Đúng", "Đúng từ khoá", "Về sảnh"])
        await user.click(screen.getByText("Đúng", BUTTON))
        expect(f.commitHint).toHaveBeenCalledOnce()
        expect(f.commitKeyword).not.toHaveBeenCalled()
        expect(screen.queryByRole("button", { name: "Sai" })).toBeNull()
    })

    it("Đúng từ khoá commits the keyword judgments when ready", async () => {
        const user = userEvent.setup()
        const f = renderRound("giai-ma", { commitKeywordReady: true })

        await user.click(screen.getByText("Đúng từ khoá", BUTTON))
        expect(f.commitKeyword).toHaveBeenCalledOnce()
        expect(f.commitHint).not.toHaveBeenCalled()
    })

    it("HIỆN TRẢ LỜI — gợi ý targets the hint on the table; từ khoá has its own", async () => {
        const user = userEvent.setup()
        const keyword = {
            _id: "kw", roundId: "giai-ma", turnId: "keyword", position: 0,
            kind: "KEYWORD" as const, questionText: "Từ khoá", timeLimit: null, points: 100,
            payload: { acceptedAnswers: [] },
        }
        const f = renderRound(
            "giai-ma", {}, {},
            { hintsRemaining: ["h2"], hintsPicked: ["h1"], openHintId: null, players: [] },
            [keyword],
        )

        await user.click(screen.getByRole("button", { name: "HIỆN TRẢ LỜI gợi ý" }))
        expect(f.send).toHaveBeenCalledWith({ kind: "reveal.answer", questionId: "h1" })

        await user.click(screen.getByRole("button", { name: "HIỆN TRẢ LỜI từ khoá" }))
        expect(f.send).toHaveBeenCalledWith({ kind: "reveal.answer", questionId: "kw" })
    })

    it("HIỆN TRẢ LỜI gợi ý is inert before the first hint", () => {
        renderRound("giai-ma", {}, {}, {
            hintsRemaining: ["h1"], hintsPicked: [], openHintId: null, players: [],
        })
        expect(screen.queryByRole("button", { name: "HIỆN TRẢ LỜI gợi ý" })).toBeNull()
    })

    it("Đếm giờ is armed in the gap between the pick and the window", async () => {
        const user = userEvent.setup()
        const f = renderRound("giai-ma", {}, {}, {
            hintsRemaining: ["h2"], hintsPicked: ["h1"], openHintId: "h1",
            windowOpen: false, keywordWindowOpen: false, players: [],
        })

        await user.click(screen.getByRole("button", { name: "Đếm giờ" }))
        expect(f.send).toHaveBeenCalledWith({ kind: "giai-ma.startWindow" })
    })

    it("Đếm giờ goes inert while the 15 s is already running", () => {
        renderRound("giai-ma", {}, {}, {
            hintsRemaining: ["h2"], hintsPicked: ["h1"], openHintId: "h1",
            windowOpen: true, keywordWindowOpen: true, players: [],
        })
        expect(screen.queryByRole("button", { name: "Đếm giờ" })).toBeNull()
    })

    it("Đếm giờ từ khoá is armed only before the countdown runs", async () => {
        const user = userEvent.setup()
        const stale = renderRound("giai-ma", {}, { roundId: "giai-ma" }, {
            hintsRemaining: ["h2"], hintsPicked: ["h1"], openHintId: "h1",
            windowOpen: false, keywordWindowOpen: false, players: [],
        }, [{ _id: "kw", roundId: "giai-ma", kind: "KEYWORD" as const,
            turnId: "t1", position: 9, questionText: "Từ khoá", points: 0, payload: { acceptedAnswers: [] } }])

        await user.click(screen.getByRole("button", { name: "Đếm giờ từ khoá" }))
        expect(stale.send).toHaveBeenCalledWith({ kind: "giai-ma.startKeywordWindow" })
    })

    it("draws the fixed EIGHT-tile board, whatever the round's hint count", () => {
        const hints = Array.from({ length: 6 }, (_, i) => ({
            _id: `h${i + 1}`,
            roundId: "giai-ma",
            kind: "TEXT" as const,
            position: i + 1,
            questionText: `gợi ý ${i + 1}`,
            points: 0,
            payload: { acceptedAnswers: [] },
        }))
        const keyword = {
            _id: "k1",
            roundId: "giai-ma",
            kind: "KEYWORD" as const,
            position: 9,
            questionText: "từ khoá",
            points: 0,
            payload: { code: "BONTUONG" },
        }
        const f = renderRound(
            "giai-ma",
            {},
            { keywordLength: 8, keywordKind: "letters" },
            null,
            [...hints, keyword] as unknown as LiveResponse["questions"],
        )
        const tiles = screen.getAllByText(/^[1-8]$/, { selector: "span" })
        expect(tiles).toHaveLength(8)
        expect(tiles.slice(0, 6).every((tile) => tile.closest("[role='button']") !== null)).toBe(true)
        expect(tiles.slice(6).map((tile) => tile.getAttribute("role"))).toEqual([null, null])
        expect(screen.getByText(/8 chữ cái/)).toBeInTheDocument()
        expect(f.remaining).toBe(30)
    })

    it("the rail cards toggle the selection (multi-select)", async () => {
        const user = userEvent.setup()
        const f = renderRound("giai-ma", {
            baseCards: [
                { id: "u1", name: "An", points: 10 },
                { id: "u2", name: "Bình", points: 5 },
            ],
        }, { open: [openQ] })
        await user.click(screen.getByText("An"))
        await user.click(screen.getByText("Bình"))
        expect(f.toggleSelect).toHaveBeenCalledWith("u1")
        expect(f.toggleSelect).toHaveBeenCalledWith("u2")
    })
})

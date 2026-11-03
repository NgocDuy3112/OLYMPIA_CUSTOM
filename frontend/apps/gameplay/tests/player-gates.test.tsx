// @vitest-environment jsdom
import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { describe, expect, it, vi } from "vitest"
import { PlayerGateScreen } from "@/components/player-gates"
import type { PlayerGate } from "@/lib/player-gate"
import type { PlayerModel } from "@/hooks/use-player-model"
import type { LobbyData } from "@shared/deck/types"

// The four screens a player can be stuck behind. They render inside the deck's
// canvas, so each one must stand alone: no provider, no socket, no camera — the
// only thing it is handed is the model. Getting one wrong strands a player in
// front of a projector-sized screen with the wrong instruction.

function model(over: Partial<PlayerModel> = {}): PlayerModel {
    return {
        myId: "u1",
        v: undefined,
        failureStatus: undefined,
        failureMessage: undefined,
        screen: "lobby",
        roundId: "",
        lobbyHint: "",
        lobby: { data: undefined } as unknown as PlayerModel["lobby"],
        retry: vi.fn(),
        ctx: null,
        render: null,
        ...over,
    }
}

const lobbyData = { label: "Trận 1", table: [], rounds: [], title: "Giải" } as unknown as LobbyData

function draw(gate: PlayerGate, over: Partial<PlayerModel> = {}) {
    return render(
        <MemoryRouter>
            <PlayerGateScreen gate={gate} model={model(over)} />
        </MemoryRouter>
    )
}

describe("PlayerGateScreen — an expired session (401)", () => {
    it("says the session is gone and offers the PIN card", () => {
        draw("unauthorized")
        expect(screen.getByText("Chưa vào trận")).toBeTruthy()
        expect(screen.getByText(/Phiên thí sinh đã hết hạn/)).toBeTruthy()
        expect(screen.getByRole("link", { name: "Nhập lại mã PIN" }).getAttribute("href")).toBe("/join")
    })
})

describe("PlayerGateScreen — the wrong seat (403)", () => {
    it("says the seat is not theirs, and offers another PIN", () => {
        draw("not-seated")
        expect(screen.getByText("Không có trong trận")).toBeTruthy()
        expect(screen.getByText(/Ghế này không thuộc về bạn/)).toBeTruthy()
        expect(screen.getByRole("link", { name: "Nhập mã khác" }).getAttribute("href")).toBe("/join")
    })

    it("does not offer a retry — retrying cannot fix the wrong seat", () => {
        draw("not-seated")
        expect(screen.queryByRole("button", { name: "Thử lại" })).toBeNull()
    })
})

describe("PlayerGateScreen — the match is not LIVE (409)", () => {
    it("waits in the lobby when it answered", () => {
        draw("not-live", { lobby: { data: lobbyData } as unknown as PlayerModel["lobby"] })
        expect(screen.getByText(/Chờ điều hành mở trận/)).toBeTruthy()
    })

    it("falls back to a gate with a retry while the lobby has not answered", () => {
        draw("not-live")
        expect(screen.getByText("Trận chưa bắt đầu")).toBeTruthy()
        expect(screen.getByRole("button", { name: "Thử lại" })).toBeTruthy()
    })
})

describe("PlayerGateScreen — loading", () => {
    it("says what it is reading, and offers no retry without a failure", () => {
        draw("loading")
        expect(screen.getByText("Đang tải…")).toBeTruthy()
        expect(screen.getByText("Đọc trạng thái vòng thi")).toBeTruthy()
        expect(screen.queryByRole("button", { name: "Thử lại" })).toBeNull()
    })

    it("shows the failure's message and a retry when the read failed", () => {
        draw("loading", { failureMessage: "Mất kết nối" })
        expect(screen.getByText("Mất kết nối")).toBeTruthy()
        expect(screen.getByRole("button", { name: "Thử lại" })).toBeTruthy()
    })
})

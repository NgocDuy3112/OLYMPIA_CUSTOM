// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { describe, expect, it, vi } from "vitest"
import { PlayerGateScreen } from "@/components/player-gates"
import type { PlayerGate } from "@/lib/player-gate"
import type { PlayerModel } from "@/hooks/use-player-model"
import type { LobbyData } from "@shared/deck/types"

// The four screens a player can be stuck behind. Each must stand alone: the only
// thing it is handed is the model (the two session gates also render the PIN door,
// which asks /gameplay/auth/methods). Getting one wrong strands a player in front
// of a projector-sized screen with the wrong instruction.
//
// The session gates used to hand out a LINK to /join; the field belongs where the
// message is, so they now carry the door itself.

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
    // the gate's PIN door asks the deployment what it offers
    vi.stubGlobal("fetch", vi.fn(async () =>
        ({ ok: true, status: 200, statusText: "", json: async () => ({ pin: true, google: false }) }) as unknown as Response
    ))
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return render(
        <QueryClientProvider client={client}>
            <MemoryRouter>
                <PlayerGateScreen gate={gate} model={model(over)} />
            </MemoryRouter>
        </QueryClientProvider>
    )
}


describe("PlayerGateScreen — an expired session (401)", () => {
    it("says the session is gone and puts the PIN FIELD right here", async () => {
        draw("unauthorized")
        expect(screen.getByText("Chưa vào trận")).toBeTruthy()
        expect(screen.getByText(/Phiên thí sinh đã hết hạn/)).toBeTruthy()
        // the message says "nhập lại mã PIN" — so the field is in the card, not a
        // link that throws the player out of the show
        expect(await screen.findByLabelText("Mã vào trận")).toBeTruthy()
        expect(screen.queryByRole("link", { name: "Nhập lại mã PIN" })).toBeNull()
    })
})

describe("PlayerGateScreen — the wrong seat (403)", () => {
    it("says the seat is not theirs, and offers the PIN field to pick another name", async () => {
        draw("not-seated")
        expect(screen.getByText("Không có trong trận")).toBeTruthy()
        expect(screen.getByText(/Ghế này không thuộc về bạn/)).toBeTruthy()
        expect(await screen.findByLabelText("Mã vào trận")).toBeTruthy()
    })

    it("does not offer a retry — retrying cannot fix the wrong seat", () => {
        draw("not-seated")
        expect(screen.queryByRole("button", { name: "Thử lại" })).toBeNull()
    })
})

describe("PlayerGateScreen — the match is not LIVE (409)", () => {
    it("waits in the lobby when it answered", () => {
        draw("not-live", { lobby: { data: lobbyData } as unknown as PlayerModel["lobby"] })
        expect(screen.getByText(/Trận đấu sắp sửa diễn ra/)).toBeTruthy()
    })

    it("falls back to a gate with a retry while the lobby has not answered", () => {
        draw("not-live")
        expect(screen.getByText("Trận chưa bắt đầu")).toBeTruthy()
        expect(screen.getByRole("button", { name: "Thử lại" })).toBeTruthy()
    })
})

describe("PlayerGateScreen — loading", () => {
    it("says what it is reading, and offers no retry without a failure", async () => {
        draw("loading")
        await waitFor(() => expect(screen.getByText("Đang tải…")).toBeTruthy())
        expect(screen.getByText("Đọc trạng thái vòng thi")).toBeTruthy()
        expect(screen.queryByRole("button", { name: "Thử lại" })).toBeNull()
    })

    it("shows the failure's message and a retry when the read failed", () => {
        draw("loading", { failureMessage: "Mất kết nối" })
        expect(screen.getByText("Mất kết nối")).toBeTruthy()
        expect(screen.getByRole("button", { name: "Thử lại" })).toBeTruthy()
    })
})

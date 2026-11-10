import { screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { RecordingsTab } from "@/components/recordings-tab"
import { renderWithProviders } from "../helpers/render"


const TOURNAMENT = "t1"
const MATCH = "m1"
const LIST_URL = `GET /portal/tournaments/${TOURNAMENT}/matches/${MATCH}/recording`
const VIDEO_URL = "https://s3.example.test/olympia-custom/recordings/m1/clip.mp4"

const row = (over: Partial<Record<string, unknown>> = {}) => ({
    id: "r1",
    matchId: MATCH,
    egressId: "e1",
    status: "STOPPED",
    s3Key: `recordings/${MATCH}/clip.mp4`,
    startedBy: null,
    startedAt: "2026-11-10T09:00:00.000Z",
    stoppedAt: "2026-11-10T10:00:00.000Z",
    error: null,
    url: VIDEO_URL,
    ...over,
})

const draw = (route: { body: unknown; status?: number }) =>
    renderWithProviders(<RecordingsTab tournamentId={TOURNAMENT} matchId={MATCH} />, {
        routes: { [LIST_URL]: route },
    })


describe("RecordingsTab", () => {
    it("shows the empty state when nothing was recorded", async () => {
        draw({ body: { items: [] } })
        expect(await screen.findByText(/Chưa có bản ghi/)).toBeTruthy()
    })

    it("renders a playable video for a finished segment", async () => {
        const { container } = draw({ body: { items: [row()] } })
        expect(await screen.findByText("Đã ghi")).toBeTruthy()
        // <video> has no queryable implicit role here — assert on the element.
        const video = container.querySelector("video")
        expect(video?.getAttribute("src")).toBe(VIDEO_URL)
        expect(video?.getAttribute("controls")).not.toBeNull()
        expect(screen.getByRole("button", { name: /Tải file gốc/ })).toBeTruthy()
        expect(screen.getByText(/Dừng lúc/)).toBeTruthy()
    })

    it("keeps the live badge and hides the player while recording", async () => {
        const { container } = draw({
            body: { items: [row({ status: "RECORDING", url: null, stoppedAt: null })] },
        })
        expect(await screen.findByText("Đang ghi")).toBeTruthy()
        expect(screen.getByText(/Đang chạy/)).toBeTruthy()
        expect(container.querySelector("video")).toBeNull()
    })

    it("surfaces the failure reason for a failed segment", async () => {
        const { container } = draw({
            body: {
                items: [
                    row({
                        status: "FAILED",
                        url: null,
                        stoppedAt: null,
                        error: "egress refused to start: page unreachable",
                    }),
                ],
            },
        })
        expect(await screen.findByText("Lỗi")).toBeTruthy()
        expect(screen.getByText("egress refused to start: page unreachable")).toBeTruthy()
        expect(container.querySelector("video")).toBeNull()
    })

    it("reports the API error when the list cannot load", async () => {
        draw({ status: 500, body: { error: "INTERNAL", message: "boom" } })
        const alert = await screen.findByRole("alert")
        expect(alert.textContent).toContain("boom")
    })
})

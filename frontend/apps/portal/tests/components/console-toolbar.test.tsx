import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import type { HostBroadcast } from "@shared/lib/rtc"
import { ConsoleToolbar } from "@/console/ConsoleToolbar"
import { renderWithProviders } from "../helpers/render"


const TOURNAMENT = "t1"
const MATCH = "m1"
const LIST_URL = `GET /portal/tournaments/${TOURNAMENT}/matches/${MATCH}/recording`
const START_URL = `POST /portal/tournaments/${TOURNAMENT}/matches/${MATCH}/recording/start`
const STOP_URL = `POST /portal/tournaments/${TOURNAMENT}/matches/${MATCH}/recording/stop`

const recordingRow = (over: Partial<Record<string, unknown>> = {}) => ({
    id: "r1",
    matchId: MATCH,
    egressId: "e1",
    status: "RECORDING",
    s3Key: `recordings/${MATCH}/clip.mp4`,
    startedBy: null,
    startedAt: "2026-11-10T09:00:00.000Z",
    stoppedAt: null,
    error: null,
    url: null,
    ...over,
})

const host = (over: Partial<HostBroadcast> = {}): HostBroadcast => ({
    connected: true,
    mediaError: null,
    video: null,
    camOn: false,
    micOn: false,
    toggleCam: vi.fn(),
    toggleMic: vi.fn(),
    ...over,
})

const draw = (routes: Record<string, { body: unknown; status?: number }>, props = { host: host() }) =>
    renderWithProviders(
        <ConsoleToolbar tournamentId={TOURNAMENT} matchId={MATCH} host={props.host} />,
        { routes }
    )

type FetchMock = ReturnType<typeof renderWithProviders>["fetchMock"]

const callCount = (mock: FetchMock, key: string) =>
    (mock?.mock.calls ?? []).filter(
        ([input, init]) => `${init?.method ?? "GET"} ${String(input)}` === key
    ).length


describe("ConsoleToolbar", () => {
    it("starts a recording from the idle toggle", async () => {
        const user = userEvent.setup()
        const { fetchMock } = draw({
            [LIST_URL]: { body: { items: [] } },
            [START_URL]: { body: { recording: recordingRow() } },
        })

        const button = await screen.findByRole("button", { name: /Ghi hình/ })
        await user.click(button)

        await waitFor(() => expect(callCount(fetchMock, START_URL)).toBe(1))
        // the mutation invalidates the list, so the toolbar re-reads it
        await waitFor(() => expect(callCount(fetchMock, LIST_URL)).toBeGreaterThanOrEqual(2))
    })

    it("offers Dừng ghi while a segment is active and stops it", async () => {
        const user = userEvent.setup()
        const { fetchMock } = draw({
            [LIST_URL]: { body: { items: [recordingRow()] } },
            [STOP_URL]: { body: { recording: recordingRow({ status: "STOPPED" }), egressStatus: "ENDING" } },
        })

        const button = await screen.findByRole("button", { name: /Dừng ghi/ })
        await user.click(button)

        await waitFor(() => expect(callCount(fetchMock, STOP_URL)).toBe(1))
    })

    it("surfaces a start failure to the operator", async () => {
        const user = userEvent.setup()
        draw({
            [LIST_URL]: { body: { items: [] } },
            [START_URL]: { status: 503, body: { error: "RECORDING", message: "RECORD_PAGE_BASE_URL is not set" } },
        })

        await user.click(await screen.findByRole("button", { name: /Ghi hình/ }))

        const alert = await screen.findByRole("alert")
        expect(alert.textContent).toContain("RECORD_PAGE_BASE_URL is not set")
    })

    it("keeps the host cam/mic buttons disabled until the room connects", async () => {
        draw({ [LIST_URL]: { body: { items: [] } } }, { host: host({ connected: false }) })

        expect(await screen.findByRole("button", { name: "Bật mic" })).toBeDisabled()
        expect(screen.getByRole("button", { name: "Bật camera" })).toBeDisabled()
    })

    it("forwards cam/mic clicks to the host broadcast", async () => {
        const user = userEvent.setup()
        const fake = host({ micOn: true, camOn: false })
        draw({ [LIST_URL]: { body: { items: [] } } }, { host: fake })

        await user.click(await screen.findByRole("button", { name: "Tắt mic" }))
        expect(fake.toggleMic).toHaveBeenCalledTimes(1)

        await user.click(screen.getByRole("button", { name: "Bật camera" }))
        expect(fake.toggleCam).toHaveBeenCalledTimes(1)
    })
})

import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import type { HostBroadcast } from "@shared/lib/rtc"
import { ConsoleToolbar } from "@/console/ConsoleToolbar"
import { renderWithProviders } from "../helpers/render"


const TOURNAMENT = "t1"
const MATCH = "m1"

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

describe("ConsoleToolbar", () => {
    it("keeps the host cam/mic buttons disabled until the room connects", async () => {
        draw({}, { host: host({ connected: false }) })

        expect(await screen.findByRole("button", { name: "Bật mic" })).toBeDisabled()
        expect(screen.getByRole("button", { name: "Bật camera" })).toBeDisabled()
    })

    it("forwards cam/mic clicks to the host broadcast", async () => {
        const user = userEvent.setup()
        const fake = host({ micOn: true, camOn: false })
        draw({}, { host: fake })

        await user.click(await screen.findByRole("button", { name: "Tắt mic" }))
        expect(fake.toggleMic).toHaveBeenCalledTimes(1)

        await user.click(screen.getByRole("button", { name: "Bật camera" }))
        expect(fake.toggleCam).toHaveBeenCalledTimes(1)
    })
})

import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
    enableSfx,
    playSfx,
    resetSfxForTests,
    sfxBlockedSnapshot,
    sfxUnlockedForTests,
} from "@shared/lib/sfx"
import { SfxUnlockBar } from "@shared/ui/sfx-unlock-bar"

const URL = "https://s3.example/aoc/sfx/ping.mp3"

class FakeAudio {
    static mode: "ok" | "reject" = "ok"
    static errorName = "NotAllowedError"
    static instances: FakeAudio[] = []
    src: string
    muted = false
    volume = 1
    play = vi.fn(() =>
        FakeAudio.mode === "ok"
            ? Promise.resolve()
            : Promise.reject(new DOMException("nope", FakeAudio.errorName))
    )
    constructor(src = "") {
        this.src = src
        FakeAudio.instances.push(this)
    }
}

beforeEach(() => {
    FakeAudio.instances = []
    FakeAudio.mode = "ok"
    FakeAudio.errorName = "NotAllowedError"
    vi.stubGlobal("Audio", FakeAudio)
})

afterEach(() => {
    resetSfxForTests()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
})

describe("playSfx — the room's speaker", () => {
    it("plays exactly the file the server named", () => {
        playSfx(URL)

        expect(FakeAudio.instances).toHaveLength(1)
        expect(FakeAudio.instances[0]!.src).toBe(URL)
        expect(FakeAudio.instances[0]!.play).toHaveBeenCalledOnce()
    })

    it("overlaps instead of queueing — two verdicts in a row are two sounds", () => {
        playSfx("https://s3.example/aoc/sfx/kd_dung.mp3")
        playSfx("https://s3.example/aoc/sfx/kd_sai.mp3")

        expect(FakeAudio.instances).toHaveLength(2)
    })

    it("says nothing when the URL is empty (S3 unconfigured on this box)", () => {
        playSfx("")
        playSfx(undefined as unknown as string)

        expect(FakeAudio.instances).toHaveLength(0)
        expect(sfxBlockedSnapshot()).toBe(false)
    })

    it("flags a consent refusal so the app can offer the one-tap unlock", async () => {
        FakeAudio.mode = "reject"
        FakeAudio.errorName = "NotAllowedError"

        playSfx(URL)
        await vi.waitFor(() => expect(sfxBlockedSnapshot()).toBe(true))
        expect(sfxUnlockedForTests()).toBe(false)
    })

    it("stays quiet about refusals that are NOT consent — a dead file must not nag", async () => {
        FakeAudio.mode = "reject"
        FakeAudio.errorName = "NotSupportedError"

        playSfx(URL)
        await new Promise((resolve) => setTimeout(resolve, 0))

        expect(sfxBlockedSnapshot()).toBe(false)
    })

    it("arms a gesture listener on refusal, and that gesture pays the toll", async () => {
        FakeAudio.mode = "reject"
        let gesture: (() => void) | null = null
        vi.spyOn(document, "addEventListener").mockImplementation(((type: string, listener: EventListener) => {
            if (type === "pointerdown") gesture = listener as () => void
        }) as typeof document.addEventListener)
        const remove = vi.spyOn(document, "removeEventListener")

        playSfx(URL)
        await vi.waitFor(() => expect(gesture).not.toBeNull())

        FakeAudio.mode = "ok"
        gesture!() // the host's first click anywhere

        expect(remove).toHaveBeenCalledWith("pointerdown", expect.any(Function), true)
        expect(remove).toHaveBeenCalledWith("keydown", expect.any(Function), true)
        expect(sfxBlockedSnapshot()).toBe(false)
        expect(sfxUnlockedForTests()).toBe(true)
    })
})

describe("enableSfx — what the bar's tap does", () => {
    it("pays the toll with the last file it heard, silently", async () => {
        FakeAudio.mode = "reject"
        playSfx(URL)
        await vi.waitFor(() => expect(sfxBlockedSnapshot()).toBe(true))

        FakeAudio.mode = "ok"
        enableSfx()

        const warm = FakeAudio.instances.at(-1)!
        expect(warm.src).toBe(URL)
        expect(warm.volume).toBe(0)
        expect(sfxBlockedSnapshot()).toBe(false)
        expect(sfxUnlockedForTests()).toBe(true)
    })
})

describe("SfxUnlockBar", () => {
    it("is invisible while sound works — automatic means no nagging", () => {
        render(<SfxUnlockBar />)
        expect(screen.queryByRole("button", { name: /Chạm để bật/ })).toBeNull()
    })

    it("appears only after a real refusal, and one tap takes it away", async () => {
        const user = userEvent.setup()
        FakeAudio.mode = "reject"
        playSfx(URL)
        await vi.waitFor(() => expect(sfxBlockedSnapshot()).toBe(true))

        render(<SfxUnlockBar />)
        const tap = screen.getByRole("button", { name: /Chạm để bật/ })

        FakeAudio.mode = "ok"
        await user.click(tap)

        await waitFor(() => expect(screen.queryByRole("button", { name: /Chạm để bật/ })).toBeNull())
    })
})

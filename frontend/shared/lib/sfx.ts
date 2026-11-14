import { useSyncExternalStore } from "react"

/**
 * The room's sound effects — files in the aoc bucket under `sfx/`, pushed by the
 * backend as `sfx` envelopes ({ name, url }) so no surface can invent a cue.
 *
 * Only the console and the audience play them; player devices never get a frame.
 *
 * Browsers lawfully refuse audio that starts without a user gesture, so this
 * module does both halves of "automatic": every cue is attempted anyway, and a
 * refusal flips a visible flag the app answers with a one-tap unlock bar. The
 * host's first click (or the bar's tap) warms a silent play and every later cue
 * lands on its own.
 */

type Listener = () => void

const listeners = new Set<Listener>()

let blocked = false
let unlocked = false
let lastUrl = ""
let gesture: (() => void) | null = null

function notify(next: boolean) {
    if (blocked === next) return
    blocked = next
    for (const listener of listeners) listener()
}

/** Pay the autoplay toll: one volume-0 play of a file we already know, while a
 *  real gesture is on the stack. Returns nothing — callers just retry later. */
function warm(): void {
    if (!lastUrl) return
    try {
        const door = new Audio(lastUrl)
        door.volume = 0
        void door.play().catch(() => undefined)
    } catch {
        // no audio stack: nothing to unlock
    }
}

function disarm() {
    if (!gesture) return
    document.removeEventListener("pointerdown", gesture, true)
    document.removeEventListener("keydown", gesture, true)
    gesture = null
}

function armUnlock() {
    if (gesture) return
    gesture = () => {
        warm()
        unlocked = true
        disarm()
        notify(false)
    }
    document.addEventListener("pointerdown", gesture, true)
    document.addEventListener("keydown", gesture, true)
}

/** Fire one sound. Never throws, never blocks the show: a refused play arms the
 *  unlock path and raises the flag the unlock bar listens to. */
export function playSfx(url: string): void {
    if (!url) return
    lastUrl = url
    try {
        const audio = new Audio(url)
        audio.play().then(
            () => {
                unlocked = true
                disarm()
                notify(false)
            },
            (error: unknown) => {
                const name = (error as { name?: string } | null)?.name
                if (name === "NotAllowedError") {
                    // autoplay policy — the only refusal worth bothering a human with
                    armUnlock()
                    notify(true)
                }
                // anything else (403, unknown codec) is infrastructure, not consent:
                // the show goes on silently rather than nagging with a dead button
            }
        )
    } catch {
        // no audio stack at all (headless capture, ancient engine)
    }
}

/** The bar's tap — a real click, so it can pay the toll immediately. */
export function enableSfx(): void {
    warm()
    unlocked = true
    disarm()
    notify(false)
}

export function subscribeSfx(listener: Listener): () => void {
    listeners.add(listener)
    return () => {
        listeners.delete(listener)
    }
}

export function sfxBlockedSnapshot(): boolean {
    return blocked
}

/** `true` while the browser is still refusing sound — drives the unlock bar. */
export function useSfxBlocked(): boolean {
    return useSyncExternalStore(subscribeSfx, sfxBlockedSnapshot, () => false)
}

/** Test seam: forget gesture listeners and the blocked flag. */
export function resetSfxForTests(): void {
    disarm()
    listeners.clear()
    blocked = false
    unlocked = false
    lastUrl = ""
}

/** Whether a sound has ever been allowed — asserted by tests, unused by UI. */
export function sfxUnlockedForTests(): boolean {
    return unlocked
}

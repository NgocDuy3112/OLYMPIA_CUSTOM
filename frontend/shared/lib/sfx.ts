import { useSyncExternalStore } from "react"


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

function warm(): void {
    if (!lastUrl) return
    try {
        const door = new Audio(lastUrl)
        door.volume = 0
        void door.play().catch(() => undefined)
    } catch {
        return
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
                    armUnlock()
                    notify(true)
                }
            }
        )
    } catch {
        return
    }
}

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

export function useSfxBlocked(): boolean {
    return useSyncExternalStore(subscribeSfx, sfxBlockedSnapshot, () => false)
}

export function resetSfxForTests(): void {
    disarm()
    listeners.clear()
    blocked = false
    unlocked = false
    lastUrl = ""
}

export function sfxUnlockedForTests(): boolean {
    return unlocked
}

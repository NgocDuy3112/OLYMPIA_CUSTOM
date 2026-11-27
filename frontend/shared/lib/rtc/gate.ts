import { useCallback, useEffect } from "react"
import { RoomEvent, type RemoteAudioTrack } from "livekit-client"
import type { Room } from "livekit-client"
import { errorMessage } from "../error-text"

type MediaPolicy = {
    mode: "all" | "countdown" | "assign"
    turnPlayerId: string | null
    answererId: string | null
    assignedToId: string | null
    buzzerId: string | null
    allowed: string[]
}

export function allowedSetOf(gate: { allowed: string[] } | null | undefined): Set<string> | null {
    if (gate === null) return null
    if (gate === undefined) return null
    return new Set(gate.allowed)
}

function volumeOf(allowed: Set<string> | null, identity: string): number {
    if (allowed === null) return 1
    if (allowed.has(identity)) return 1
    return 0
}

export function mediaErrorOf(e: unknown): string {
    if (e instanceof DOMException) {
        if (e.name === "NotAllowedError" || e.name === "SecurityError") {
            return "Trình duyệt chặn quyền camera/mic — cho phép quyền cho trang này rồi thử lại."
        }
        if (e.name === "NotFoundError") return "Không tìm thấy camera/micro trên máy."
        if (e.name === "NotReadableError") return "Camera đang được ứng dụng khác sử dụng."
        return e.message
    }
    return errorMessage(e)
}

export function useAudioGate(room: Room | null, gate: { allowed: string[] } | null | undefined): void {
    const apply = useCallback(() => {
        if (!room) return
        const allowed = allowedSetOf(gate)
        for (const participant of room.remoteParticipants.values()) {
            for (const publication of participant.trackPublications.values()) {
                if (publication.track && publication.track.kind === "audio") {
                    const volume = volumeOf(allowed, participant.identity)
                    ;(publication.track as RemoteAudioTrack).setVolume(volume)
                }
            }
        }
    }, [room, gate])

    useEffect(() => {
        apply()
        if (!room) return
        const again = () => apply()
        room.on(RoomEvent.TrackSubscribed, again)
        room.on(RoomEvent.ParticipantConnected, again)
        return () => {
            room.off(RoomEvent.TrackSubscribed, again)
            room.off(RoomEvent.ParticipantConnected, again)
        }
    }, [apply, room])
}

export function useMediaPolicy(room: Room | null, policy: MediaPolicy | null | undefined): void {
    useEffect(() => {
        if (!room) return
        const sync = () => {
            const allowed = new Set(policy?.allowed ?? [])
            const mode = policy?.mode ?? "all"
            for (const participant of room.remoteParticipants.values()) {
                for (const publication of participant.trackPublications.values()) {
                    if (publication.kind !== "audio") continue
                    const identity = participant.identity
                    let wantSubscribed = true
                    let wantVolume = 1
                    if (mode === "countdown") {
                        wantSubscribed = identity === policy?.turnPlayerId
                        wantVolume = identity === policy?.turnPlayerId ? 1 : 0
                    }
                    if (mode === "assign") {
                        const allow = identity === policy?.turnPlayerId || identity === policy?.assignedToId
                        wantSubscribed = allow
                        wantVolume = allow ? 1 : 0
                    }
                    if (mode === "all") {
                        wantSubscribed = true
                        wantVolume = 1
                    }
                    if (allowed.size > 0 && mode !== "all") {
                        const allow = allowed.has(identity)
                        if (!allow) {
                            wantSubscribed = false
                            wantVolume = 0
                        }
                    }
                    if (publication.isSubscribed !== wantSubscribed) publication.setSubscribed(wantSubscribed)
                    const track = publication.track
                    if (track) (track as RemoteAudioTrack).setVolume(wantVolume)
                }
            }
        }
        sync()
        const events = [
            RoomEvent.TrackSubscribed,
            RoomEvent.TrackPublished,
            RoomEvent.TrackUnpublished,
            RoomEvent.ParticipantConnected,
            RoomEvent.ParticipantDisconnected,
        ] as const
        for (const event of events) room.on(event, sync)
        return () => {
            for (const event of events) room.off(event, sync)
        }
    }, [room, policy])
}

export async function probeMediaPermission(devices: {
    getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>
}): Promise<string | null> {
    let refusal: string | null = null
    for (const kind of ["video", "audio"] as const) {
        try {
            const stream = await devices.getUserMedia({ [kind]: true })
            for (const track of stream.getTracks()) track.stop()
        } catch (e) {
            refusal = refusal ?? mediaErrorOf(e)
        }
    }
    return refusal
}

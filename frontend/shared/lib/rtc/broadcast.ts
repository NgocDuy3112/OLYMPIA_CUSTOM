import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react"
import { RoomEvent, type LocalVideoTrack, type RemoteAudioTrack } from "livekit-client"
import type { Room } from "livekit-client"
import { fetchPlayerRtcToken, useRtcRoom, type RtcRoomError, type RtcStatus } from "./room"
import { allowedSetOf, mediaErrorOf, probeMediaPermission } from "./gate"

interface SelfBroadcast {
    status: RtcStatus
    error: RtcRoomError | null
    mediaError: string | null
    video: LocalVideoTrack | null
    camOn: boolean
    micOn: boolean
    deafen: boolean
    setSpeakGate: (allowed: boolean | null) => void
    setAudioGate: (gate: { allowed: string[] } | null) => void
}

export const SelfBroadcastContext = createContext<SelfBroadcast | null>(null)

export function useSelfCam(): SelfBroadcast | null {
    return useContext(SelfBroadcastContext)
}

export function useSelfBroadcast(matchId: string): SelfBroadcast {
    const { room, status, error } = useRtcRoom({
        enabled: Boolean(matchId),
        autoSubscribe: false,
        getToken: () => fetchPlayerRtcToken(matchId),
        resetKey: matchId,
    })

    const [video, setVideo] = useState<LocalVideoTrack | null>(null)
    const [camOn, setCamOn] = useState(true)
    const [micOn, setMicOn] = useState(true)
    const [mediaError, setMediaError] = useState<string | null>(null)
    const [deafen, setDeafen] = useState(false)
    const [audioGate, setAudioGateState] = useState<{ allowed: string[] } | null>(null)

    const speakGate = useRef<boolean | null>(null)
    const micIntent = useRef(true)
    const enabledFor = useRef<Room | null>(null)
    const probed = useRef(false)

    useEffect(() => {
        if (probed.current || !matchId) return
        probed.current = true
        let devices: MediaDevices | undefined
        if (typeof navigator !== "undefined") devices = navigator.mediaDevices
        if (!devices?.getUserMedia) return
        void probeMediaPermission(devices).then((refusal) => {
            if (refusal) setMediaError((prev) => prev ?? refusal)
        })
    }, [matchId])

    useEffect(() => {
        if (status !== "connected" || !room || enabledFor.current === room) return
        enabledFor.current = room
        void (async () => {
            try {
                const pub = await room.localParticipant.setCameraEnabled(true)
                const track = pub?.track
                if (track && track.kind === "video") setVideo(track as LocalVideoTrack)
            } catch (e) {
                setMediaError(mediaErrorOf(e))
            }
            try {
                let on = micIntent.current
                if (speakGate.current === false) on = false
                await room.localParticipant.setMicrophoneEnabled(on)
                setMicOn(on)
            } catch (e) {
                setMediaError((prev) => prev ?? mediaErrorOf(e))
            }
        })()
    }, [room, status])

    useEffect(() => {
        if (!room) return
        const handleData = (payload: Uint8Array) => {
            try {
                const text = new TextDecoder().decode(payload)
                const msg = JSON.parse(text) as {
                    type?: string
                    targetId?: string
                    on?: boolean
                }
                if (msg.targetId !== room.localParticipant.identity) return
                if (msg.on === undefined) return

                if (msg.type === "device_mic") {
                    const next = msg.on
                    micIntent.current = next
                    setMicOn(next)
                    void room.localParticipant
                        .setMicrophoneEnabled(next)
                        .then(() => reportOwnState(room, "device_mic", next))
                }

                if (msg.type === "device_audio") {
                    setDeafen(!msg.on)
                    reportOwnState(room, "device_audio", msg.on)
                    return
                }

                if (msg.type === "device_cam") {
                    const next = msg.on
                    setCamOn(next)
                    if (!next) setVideo(null)
                    void room.localParticipant.setCameraEnabled(next).then((pub) => {
                        const track = pub?.track
                        if (next && track && track.kind === "video") {
                            setVideo(track as LocalVideoTrack)
                        }
                        reportOwnState(room, "device_cam", next)
                    })
                }
            } catch {
                return
            }
        }

        room.on(RoomEvent.DataReceived, handleData)
        return () => {
            room.off(RoomEvent.DataReceived, handleData)
        }
    }, [room])

    useEffect(() => {
        if (!room) return
        const allowed = allowedSetOf(audioGate)
        const sync = () => {
            for (const participant of room.remoteParticipants.values()) {
                for (const publication of participant.trackPublications.values()) {
                    if (publication.kind !== "audio") continue
                    const want = !deafen
                    if (publication.isSubscribed !== want) publication.setSubscribed(want)
                    const track = publication.track
                    if (track) {
                        const audible = !deafen && allowed !== null && allowed.has(participant.identity)
                        let volume = 0
                        if (audible) volume = 1
                        ;(track as RemoteAudioTrack).setVolume(volume)
                    }
                }
            }
        }
        sync()
        const events = [
            RoomEvent.TrackPublished,
            RoomEvent.TrackSubscribed,
            RoomEvent.TrackUnpublished,
            RoomEvent.ParticipantConnected,
            RoomEvent.ParticipantDisconnected,
        ] as const
        for (const event of events) room.on(event, sync)
        return () => {
            for (const event of events) room.off(event, sync)
        }
    }, [room, deafen, audioGate])

    const setSpeakGate = useCallback((allowed: boolean | null) => {
        if (speakGate.current === allowed) return
        speakGate.current = allowed
        let on = micIntent.current
        if (allowed === false) on = false
        setMicOn(on)
        const active = enabledFor.current
        if (active) {
            void active.localParticipant
                .setMicrophoneEnabled(on)
                .catch((e: unknown) => setMediaError(mediaErrorOf(e)))
        }
    }, [])

    const setAudioGate = useCallback((gate: { allowed: string[] } | null) => {
        setAudioGateState((prev) => {
            if (prev === gate) return prev
            return gate
        })
    }, [])

    return { status, error, mediaError, video, camOn, micOn, deafen, setSpeakGate, setAudioGate }
}

function reportOwnState(room: Room, type: string, on: boolean) {
    const payload = new TextEncoder().encode(
        JSON.stringify({ type, sourceId: room.localParticipant.identity, on })
    )
    void room.localParticipant.publishData(payload, { reliable: true })
}

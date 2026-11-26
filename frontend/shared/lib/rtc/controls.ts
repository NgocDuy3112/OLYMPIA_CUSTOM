import { useEffect, useState } from "react"
import { RoomEvent, type LocalVideoTrack, type RemoteAudioTrack } from "livekit-client"
import type { Room } from "livekit-client"
import { applyPeerVideo, peerMicOn, useRtcPeerTracks } from "./peers"
import { mediaErrorOf } from "./gate"

export interface HostBroadcast {
    connected: boolean
    mediaError: string | null
    video: LocalVideoTrack | null
    camOn: boolean
    micOn: boolean
    deafen: boolean
    toggleCam: () => void
    toggleMic: () => void
    toggleDeafen: () => void
}

export function useHostBroadcast(room: Room | null): HostBroadcast {
    const [video, setVideo] = useState<LocalVideoTrack | null>(null)
    const [camOn, setCamOn] = useState(false)
    const [micOn, setMicOn] = useState(false)
    const [mediaError, setMediaError] = useState<string | null>(null)
    const [deafen, setDeafen] = useState(false)
    const [prevRoom, setPrevRoom] = useState(room)
    if (room !== prevRoom) {
        setPrevRoom(room)
        if (!room) {
            setVideo(null)
            setCamOn(false)
            setMicOn(false)
        }
    }

    useEffect(() => {
        if (!room) return
        const sync = () => {
            for (const participant of room.remoteParticipants.values()) {
                for (const publication of participant.trackPublications.values()) {
                    if (publication.kind !== "audio") continue
                    const want = !deafen
                    if (publication.isSubscribed !== want) publication.setSubscribed(want)
                    const track = publication.track
                    if (track) {
                        let volume = 0
                        if (!deafen) volume = 1
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
    }, [room, deafen])

    const toggleCam = () => {
        if (!room) return
        const next = !camOn
        void room.localParticipant
            .setCameraEnabled(next)
            .then((pub) => {
                setCamOn(next)
                const track = pub?.track
                if (next && track && track.kind === "video") {
                    setVideo(track as LocalVideoTrack)
                } else if (!next) {
                    setVideo(null)
                }
            })
            .catch((e: unknown) => setMediaError(mediaErrorOf(e)))
    }

    const toggleMic = () => {
        if (!room) return
        const next = !micOn
        void room.localParticipant
            .setMicrophoneEnabled(next)
            .then(() => setMicOn(next))
            .catch((e: unknown) => setMediaError(mediaErrorOf(e)))
    }

    const toggleDeafen = () => setDeafen((prev) => !prev)

    return {
        connected: room !== null,
        mediaError,
        video,
        camOn,
        micOn,
        deafen,
        toggleCam,
        toggleMic,
        toggleDeafen,
    }
}

export interface PeerControls {
    isMicOn: boolean
    isAudioMuted: boolean
    isVideoHidden: boolean
    togglePlayerAudio: (id: string) => void
    togglePlayerVideo: (id: string) => void
    togglePlayerMic: (id: string) => void
    togglePlayerCam: (id: string) => void
}

export type RtcPeerControlsMap = ReadonlyMap<string, PeerControls>

export function useRtcPeerControls(room: Room | null): RtcPeerControlsMap {
    const [videoHidden, setVideoHidden] = useState<ReadonlySet<string>>(new Set())
    const tracks = useRtcPeerTracks(room)

    useEffect(() => {
        if (!room) return
        for (const id of videoHidden) applyPeerVideo(room, id, false)
    }, [room, videoHidden])

    const togglePlayerVideo = (id: string) => {
        setVideoHidden((prev) => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            if (room) applyPeerVideo(room, id, !next.has(id))
            return next
        })
    }

    const [reportedCamOff, setReportedCamOff] = useState<ReadonlySet<string>>(new Set())
    const [reportedAudioOff, setReportedAudioOff] = useState<ReadonlySet<string>>(new Set())

    useEffect(() => {
        if (!room) return
        const handleData = (payload: Uint8Array) => {
            try {
                const text = new TextDecoder().decode(payload)
                const msg = JSON.parse(text) as {
                    type?: string
                    sourceId?: string
                    on?: boolean
                }
                if (msg.sourceId === undefined) return
                if (msg.on === undefined) return

                if (msg.type === "device_cam") {
                    setReportedCamOff((prev) => {
                        const next = new Set(prev)
                        if (msg.on!) next.delete(msg.sourceId!)
                        else next.add(msg.sourceId!)
                        return next
                    })
                }

                if (msg.type === "device_audio") {
                    setReportedAudioOff((prev) => {
                        const next = new Set(prev)
                        if (msg.on!) next.delete(msg.sourceId!)
                        else next.add(msg.sourceId!)
                        return next
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

    const togglePlayerMic = (id: string) => {
        if (!room) return
        const peer = tracks.get(id)
        const currentlyOn = peerMicOn(peer?.audio)
        publishDeviceOrder(room, "device_mic", id, !currentlyOn)
    }

    const togglePlayerAudio = (id: string) => {
        if (!room) return
        const currentlyAudible = !reportedAudioOff.has(id)
        publishDeviceOrder(room, "device_audio", id, !currentlyAudible)
    }

    const togglePlayerCam = (id: string) => {
        if (!room) return
        const peer = tracks.get(id)
        const currentlyOn = !reportedCamOff.has(id) && Boolean(peer?.video)
        publishDeviceOrder(room, "device_cam", id, !currentlyOn)
    }

    const controls = new Map<string, PeerControls>()
    if (room) {
        for (const id of room.remoteParticipants.keys()) {
            const peer = tracks.get(id)
            const micOn = peerMicOn(peer?.audio)
            const camOn = !reportedCamOff.has(id) && Boolean(peer?.video)
            controls.set(id, {
                isMicOn: micOn,
                isAudioMuted: reportedAudioOff.has(id),
                isVideoHidden: videoHidden.has(id) || !camOn,
                togglePlayerAudio,
                togglePlayerVideo,
                togglePlayerMic,
                togglePlayerCam,
            })
        }
    }

    return controls
}

function publishDeviceOrder(room: Room, type: string, targetId: string, on: boolean) {
    const payload = new TextEncoder().encode(JSON.stringify({ type, targetId, on }))
    void room.localParticipant.publishData(payload, { reliable: true })
}

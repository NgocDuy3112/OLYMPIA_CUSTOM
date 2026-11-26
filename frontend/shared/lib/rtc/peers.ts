import { useCallback, useSyncExternalStore } from "react"
import { RoomEvent, type RemoteAudioTrack, type RemoteVideoTrack } from "livekit-client"
import type { Room } from "livekit-client"

interface RtcPeerTracks {
    video?: RemoteVideoTrack
    audio?: RemoteAudioTrack
}

export type RtcPeerTracksMap = ReadonlyMap<string, RtcPeerTracks>

const EMPTY_PEERS: RtcPeerTracksMap = new Map()
const noop = () => {}

const peerVersion = new WeakMap<Room, number>()
const peerCache = new WeakMap<Room, { version: number; peers: RtcPeerTracksMap }>()

function peersOf(room: Room): RtcPeerTracksMap {
    const version = peerVersion.get(room) ?? 0
    const cached = peerCache.get(room)
    if (cached && cached.version === version) return cached.peers

    const peers = new Map<string, RtcPeerTracks>()
    for (const [identity, participant] of room.remoteParticipants) {
        const tracks: RtcPeerTracks = {}
        for (const pub of participant.trackPublications.values()) {
            if (!pub.track) continue
            if (pub.track.kind === "video") tracks.video = pub.track as RemoteVideoTrack
            else tracks.audio = pub.track as RemoteAudioTrack
        }
        if (tracks.video || tracks.audio) peers.set(identity, tracks)
    }

    peerCache.set(room, { version, peers })
    return peers
}

const PEER_EVENTS = [
    RoomEvent.TrackSubscribed,
    RoomEvent.TrackUnsubscribed,
    RoomEvent.TrackMuted,
    RoomEvent.TrackUnmuted,
    RoomEvent.ParticipantDisconnected,
    RoomEvent.ParticipantConnected,
    RoomEvent.Disconnected,
] as const

function subscribePeers(room: Room, notify: () => void): () => void {
    const bump = () => {
        peerVersion.set(room, (peerVersion.get(room) ?? 0) + 1)
        notify()
    }
    for (const event of PEER_EVENTS) room.on(event, bump)
    return () => {
        for (const event of PEER_EVENTS) room.off(event, bump)
    }
}

export function useRtcPeerTracks(room: Room | null): RtcPeerTracksMap {
    const subscribe = useCallback(
        (notify: () => void) => {
            if (room === null) return noop
            return subscribePeers(room, notify)
        },
        [room]
    )
    const snapshot = useCallback(() => {
        if (room === null) return EMPTY_PEERS
        return peersOf(room)
    }, [room])
    return useSyncExternalStore(subscribe, snapshot)
}

export function peerMicOn(track: RemoteAudioTrack | undefined): boolean {
    if (!track) return false
    return !track.isMuted
}

function peerVideoPublication(room: Room, id: string) {
    const participant = room.remoteParticipants.get(id)
    if (!participant) return null
    for (const publication of participant.trackPublications.values()) {
        if (publication.kind !== "video") continue
        return publication
    }
    return null
}

export function applyPeerVideo(room: Room, id: string, visible: boolean) {
    const publication = peerVideoPublication(room, id)
    if (!publication) return
    if (publication.isSubscribed !== visible) publication.setSubscribed(visible)
}

import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
    Room,
    RoomEvent,
    ConnectionState,
    type LocalVideoTrack,
    type RemoteAudioTrack,
    type RemoteVideoTrack,
} from "livekit-client";
import { api, ApiError } from "./api";


interface RtcToken {
    url: string;
    token: string;
    identity: string;
    room: string;
    expiresIn: number;
}

function fetchPlayerRtcToken(matchId: string): Promise<RtcToken> {
    return api<RtcToken>(`/gameplay/matches/${matchId}/rtc/token`, { method: "POST" });
}

export function fetchOperatorRtcToken(tournamentId: string, matchId: string): Promise<RtcToken> {
    return api<RtcToken>(
        `/portal/tournaments/${tournamentId}/matches/${matchId}/rtc/token`,
        { method: "POST" }
    );
}


interface RtcPeerTracks {
    video?: RemoteVideoTrack;
    audio?: RemoteAudioTrack;
}

type RtcPeerTracksMap = ReadonlyMap<string, RtcPeerTracks>;


export type RtcStatus =
    | "idle"          
    | "connecting"    
    | "connected"
    | "reconnecting"  
    | "disconnected"  
    | "failed";       

interface RtcRoomError {
    message: string;
    status?: number;
}

interface RtcRoomHandle {
    room: Room | null;
    status: RtcStatus;
    error: RtcRoomError | null;
}

export function useRtcRoom(opts: {
    enabled: boolean;
    autoSubscribe: boolean;
    getToken: () => Promise<RtcToken>;
    resetKey?: string;
}): RtcRoomHandle {
    const { enabled, autoSubscribe, resetKey } = opts;

    const getToken = useRef(opts.getToken);
    useEffect(() => {
        getToken.current = opts.getToken;
    });

    const key = `${enabled}|${autoSubscribe}|${resetKey ?? ""}`;
    const [dial, setDial] = useState<Dial | null>(null);
    const current = dial && dial.key === key ? dial : null;

    useEffect(() => {
        if (!enabled) return;

        let cancelled = false;
        let active: Room | null = null;

        const write = (patch: Partial<Omit<Dial, "key">>) => {
            if (cancelled) return;
            setDial((prev) => ({
                key,
                room: null,
                connection: null,
                error: null,
                ...(prev && prev.key === key ? prev : null),
                ...patch,
            }));
        };

        const onState = (state: ConnectionState) => write({ connection: state });

        void (async () => {
            try {
                const grant = await getToken.current();
                if (cancelled) return;

                const next = new Room();
                active = next;
                next.on(RoomEvent.ConnectionStateChanged, onState);

                await next.connect(grant.url, grant.token, { autoSubscribe });
                if (cancelled) {
                    await next.disconnect(true);
                    return;
                }
                write({ room: next, connection: ConnectionState.Connected });
            } catch (e) {
                if (cancelled) return;
                write({
                    error: {
                        message: e instanceof Error ? e.message : String(e),
                        status: e instanceof ApiError ? e.status : undefined,
                    },
                });
                if (active) await active.disconnect(true).catch(() => {});
            }
        })();

        return () => {
            cancelled = true;
            if (active) {
                active.off(RoomEvent.ConnectionStateChanged, onState);
                void active.disconnect(true).catch(() => {});
            }
        };
    }, [enabled, autoSubscribe, resetKey, key]);

    return {
        room: current?.room ?? null,
        status: statusOf(enabled, current),
        error: current?.error ?? null,
    };
}

interface Dial {
    key: string;
    room: Room | null;
    connection: ConnectionState | null;
    error: RtcRoomError | null;
}

function statusOf(enabled: boolean, dial: Dial | null): RtcStatus {
    if (!enabled) return "idle";
    if (!dial) return "connecting";            
    if (dial.error) return "failed";
    switch (dial.connection) {
        case ConnectionState.Connected:
            return "connected";
        case ConnectionState.Reconnecting:
            return "reconnecting";
        case ConnectionState.Disconnected:
            return "disconnected";
        default:
            return "connecting";
    }
}


const EMPTY_PEERS: RtcPeerTracksMap = new Map();
const noop = () => {};

const peerVersion = new WeakMap<Room, number>();
const peerCache = new WeakMap<Room, { version: number; peers: RtcPeerTracksMap }>();

function peersOf(room: Room): RtcPeerTracksMap {
    const version = peerVersion.get(room) ?? 0;
    const cached = peerCache.get(room);
    if (cached && cached.version === version) return cached.peers;

    const peers = new Map<string, RtcPeerTracks>();
    for (const [identity, participant] of room.remoteParticipants) {
        const tracks: RtcPeerTracks = {};
        for (const pub of participant.trackPublications.values()) {
            if (!pub.track) continue;
            if (pub.track.kind === "video") tracks.video = pub.track as RemoteVideoTrack;
            else tracks.audio = pub.track as RemoteAudioTrack;
        }
        if (tracks.video || tracks.audio) peers.set(identity, tracks);
    }

    peerCache.set(room, { version, peers });
    return peers;
}

const PEER_EVENTS = [
    RoomEvent.TrackSubscribed,
    RoomEvent.TrackUnsubscribed,
    RoomEvent.ParticipantDisconnected,
    RoomEvent.ParticipantConnected,
    RoomEvent.Disconnected,
] as const;

function subscribePeers(room: Room, notify: () => void): () => void {
    const bump = () => {
        peerVersion.set(room, (peerVersion.get(room) ?? 0) + 1);
        notify();
    };
    for (const event of PEER_EVENTS) room.on(event, bump);
    return () => {
        for (const event of PEER_EVENTS) room.off(event, bump);
    };
}

export function useRtcPeerTracks(room: Room | null): RtcPeerTracksMap {
    const subscribe = useCallback(
        (notify: () => void) => (room ? subscribePeers(room, notify) : noop),
        [room]
    );
    const snapshot = useCallback(() => (room ? peersOf(room) : EMPTY_PEERS), [room]);
    return useSyncExternalStore(subscribe, snapshot);
}


function mediaErrorOf(e: unknown): string {
    if (e instanceof DOMException) {
        if (e.name === "NotAllowedError" || e.name === "SecurityError") {
            return "Trình duyệt chặn quyền camera/mic — cho phép quyền cho trang này rồi thử lại.";
        }
        if (e.name === "NotFoundError") return "Không tìm thấy camera/micro trên máy.";
        if (e.name === "NotReadableError") return "Camera đang được ứng dụng khác sử dụng.";
        return e.message;
    }
    return e instanceof Error ? e.message : String(e);
}

interface SelfBroadcast {
    status: RtcStatus;
    error: RtcRoomError | null;
    mediaError: string | null;
    video: LocalVideoTrack | null;
    camOn: boolean;
    micOn: boolean;
    toggleCam: () => void;
    toggleMic: () => void;
    setSpeakGate: (allowed: boolean | null) => void;
}

export const SelfBroadcastContext = createContext<SelfBroadcast | null>(null);

export function useSelfCam(): SelfBroadcast | null {
    return useContext(SelfBroadcastContext);
}

export function useAudioGate(room: Room | null, gate: { allowed: string[] } | null | undefined): void {
    const apply = useCallback(() => {
        if (!room) return;
        const allowed = gate ? new Set(gate.allowed) : null;
        for (const participant of room.remoteParticipants.values()) {
            for (const publication of participant.trackPublications.values()) {
                if (publication.track && publication.track.kind === "audio") {
                    (publication.track as RemoteAudioTrack).setVolume(
                        allowed === null || allowed.has(participant.identity) ? 1 : 0
                    );
                }
            }
        }
    }, [room, gate]);

    useEffect(() => {
        apply();
        if (!room) return;
        const again = () => apply();
        room.on(RoomEvent.TrackSubscribed, again);
        room.on(RoomEvent.ParticipantConnected, again);
        return () => {
            room.off(RoomEvent.TrackSubscribed, again);
            room.off(RoomEvent.ParticipantConnected, again);
        };
    }, [apply, room]);
}

export async function probeMediaPermission(devices: {
    getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>
}): Promise<string | null> {
    let refusal: string | null = null;
    for (const kind of ["video", "audio"] as const) {
        try {
            const stream = await devices.getUserMedia({ [kind]: true });
            for (const track of stream.getTracks()) track.stop();
        } catch (e) {
            refusal = refusal ?? mediaErrorOf(e);
        }
    }
    return refusal;
}

export function useSelfBroadcast(matchId: string): SelfBroadcast {
    const { room, status, error } = useRtcRoom({
        enabled: Boolean(matchId),
        autoSubscribe: false,
        getToken: () => fetchPlayerRtcToken(matchId),
        resetKey: matchId,
    });

    const [video, setVideo] = useState<LocalVideoTrack | null>(null);
    const [camOn, setCamOn] = useState(true);
    const [micOn, setMicOn] = useState(true);
    const [mediaError, setMediaError] = useState<string | null>(null);

    const speakGate = useRef<boolean | null>(null);
    const micIntent = useRef(true);
    const enabledFor = useRef<Room | null>(null);
    const probed = useRef(false);

    useEffect(() => {
        if (probed.current || !matchId) return;
        probed.current = true;
        const devices = typeof navigator === "undefined" ? undefined : navigator.mediaDevices;
        if (!devices?.getUserMedia) return; 
        void probeMediaPermission(devices).then((refusal) => {
            if (refusal) setMediaError((prev) => prev ?? refusal);
        });
    }, [matchId]);

    useEffect(() => {
        if (status !== "connected" || !room || enabledFor.current === room) return;
        enabledFor.current = room;
        void (async () => {
            try {
                const pub = await room.localParticipant.setCameraEnabled(true);
                const track = pub?.track;
                if (track && track.kind === "video") setVideo(track as LocalVideoTrack);
            } catch (e) {
                setMediaError(mediaErrorOf(e));
            }
            try {
                const on =
                    speakGate.current === null
                        ? micIntent.current
                        : speakGate.current && micIntent.current;
                await room.localParticipant.setMicrophoneEnabled(on);
                setMicOn(on);
            } catch (e) {
                setMediaError((prev) => prev ?? mediaErrorOf(e));
            }
        })();
    }, [room, status]);

    useEffect(() => {
        if (status !== "connected" && status !== "reconnecting") setVideo(null);
    }, [status]);

    const toggleCam = () => {
        if (!room) return;
        const next = !camOn;
        void room.localParticipant
            .setCameraEnabled(next)
            .then((pub) => {
                setCamOn(next);
                const track = pub?.track;
                if (next && track && track.kind === "video") setVideo(track as LocalVideoTrack);
            })
            .catch((e: unknown) => setMediaError(mediaErrorOf(e)));
    };

    const toggleMic = () => {
        if (!room) return;
        if (speakGate.current === false) return;
        const next = !micIntent.current;
        micIntent.current = next;
        void room.localParticipant
            .setMicrophoneEnabled(next)
            .then(() => setMicOn(next))
            .catch((e: unknown) => setMediaError(mediaErrorOf(e)));
    };

    const setSpeakGate = useCallback((allowed: boolean | null) => {
        if (speakGate.current === allowed) return;
        speakGate.current = allowed;
        const on = allowed === null ? micIntent.current : allowed && micIntent.current;
        setMicOn(on); 
        const active = enabledFor.current;
        if (active) {
            void active.localParticipant
                .setMicrophoneEnabled(on)
                .catch((e: unknown) => setMediaError(mediaErrorOf(e)));
        }
    }, []);

    return { status, error, mediaError, video, camOn, micOn, toggleCam, toggleMic, setSpeakGate };
}

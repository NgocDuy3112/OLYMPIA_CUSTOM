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
    return api<RtcToken>(`/api/matches/${matchId}/rtc/token`, { method: "POST" });
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

export type MediaPolicy = {
    mode: "all" | "countdown" | "assign"
    turnPlayerId: string | null
    answererId: string | null
    assignedToId: string | null
    buzzerId: string | null
    allowed: string[]
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
    const current = matchingDial(dial, key);

    useEffect(() => {
        if (!enabled) return;

        let cancelled = false;
        let active: Room | null = null;

        const write = (patch: Partial<Omit<Dial, "key">>) => {
            if (cancelled) return;
            setDial((prev) => {
                const carry = carriedDial(prev, key);
                return {
                    key,
                    room: null,
                    connection: null,
                    error: null,
                    ...carry,
                    ...patch,
                };
            });
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
                        message: messageOf(e),
                        status: apiStatusOf(e),
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

function matchingDial(dial: Dial | null, key: string): Dial | null {
    if (dial === null) return null;
    if (dial.key !== key) return null;
    return dial;
}

function carriedDial(prev: Dial | null, key: string): Partial<Dial> {
    if (prev === null) return {};
    if (prev.key !== key) return {};
    return prev;
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
    RoomEvent.TrackMuted,
    RoomEvent.TrackUnmuted,
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
        (notify: () => void) => {
            if (room === null) return noop;
            return subscribePeers(room, notify);
        },
        [room]
    );
    const snapshot = useCallback(() => {
        if (room === null) return EMPTY_PEERS;
        return peersOf(room);
    }, [room]);
    return useSyncExternalStore(subscribe, snapshot);
}


function messageOf(e: unknown): string {
    if (e instanceof Error) return e.message;
    return String(e);
}

function apiStatusOf(e: unknown): number | undefined {
    if (e instanceof ApiError) return e.status;
    return undefined;
}

function allowedSetOf(gate: { allowed: string[] } | null | undefined): Set<string> | null {
    if (gate === null) return null;
    if (gate === undefined) return null;
    return new Set(gate.allowed);
}

function volumeOf(allowed: Set<string> | null, identity: string): number {
    if (allowed === null) return 1;
    if (allowed.has(identity)) return 1;
    return 0;
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
    return messageOf(e);
}

interface SelfBroadcast {
    status: RtcStatus;
    error: RtcRoomError | null;
    mediaError: string | null;
    video: LocalVideoTrack | null;
    camOn: boolean;
    micOn: boolean;
    deafen: boolean;
    toggleCam: () => void;
    toggleMic: () => void;
    toggleDeafen: () => void;
    setSpeakGate: (allowed: boolean | null) => void;
    setAudioGate: (gate: { allowed: string[] } | null) => void;
}

export const SelfBroadcastContext = createContext<SelfBroadcast | null>(null);

export function useSelfCam(): SelfBroadcast | null {
    return useContext(SelfBroadcastContext);
}

export function useAudioGate(room: Room | null, gate: { allowed: string[] } | null | undefined): void {
    const apply = useCallback(() => {
        if (!room) return;
        const allowed = allowedSetOf(gate);
        for (const participant of room.remoteParticipants.values()) {
            for (const publication of participant.trackPublications.values()) {
                if (publication.track && publication.track.kind === "audio") {
                    const volume = volumeOf(allowed, participant.identity);
                    (publication.track as RemoteAudioTrack).setVolume(volume);
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
    const [deafen, setDeafen] = useState(false);
    const [audioGate, setAudioGateState] = useState<{ allowed: string[] } | null>(null);

    const speakGate = useRef<boolean | null>(null);
    const micIntent = useRef(true);
    const enabledFor = useRef<Room | null>(null);
    const probed = useRef(false);

    useEffect(() => {
        if (probed.current || !matchId) return;
        probed.current = true;
        let devices: MediaDevices | undefined;
        if (typeof navigator !== "undefined") devices = navigator.mediaDevices;
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
                let on = micIntent.current;
                if (speakGate.current === false) on = false;
                await room.localParticipant.setMicrophoneEnabled(on);
                setMicOn(on);
            } catch (e) {
                setMediaError((prev) => prev ?? mediaErrorOf(e));
            }
        })();
    }, [room, status]);

    useEffect(() => {
        if (!room) return;
        const handleData = (payload: Uint8Array) => {
            try {
                const text = new TextDecoder().decode(payload);
                const msg = JSON.parse(text) as {
                    type?: string;
                    targetId?: string;
                    on?: boolean;
                };
                if (msg.targetId !== room.localParticipant.identity) return;
                if (msg.on === undefined) return;

                if (msg.type === "device_mic") {
                    const next = msg.on;
                    micIntent.current = next;
                    setMicOn(next);
                    void room.localParticipant
                        .setMicrophoneEnabled(next)
                        .then(() => reportOwnState(room, "device_mic", next));
                }

                if (msg.type === "device_audio") {
                    setDeafen(!msg.on);
                    reportOwnState(room, "device_audio", msg.on);
                    return;
                }

                if (msg.type === "device_cam") {
                    const next = msg.on;
                    setCamOn(next);
                    if (!next) setVideo(null);
                    void room.localParticipant.setCameraEnabled(next).then((pub) => {
                        const track = pub?.track;
                        if (next && track && track.kind === "video") {
                            setVideo(track as LocalVideoTrack);
                        }
                        reportOwnState(room, "device_cam", next);
                    });
                }
            } catch {
                return;
            }
        };

        room.on(RoomEvent.DataReceived, handleData);
        return () => {
            room.off(RoomEvent.DataReceived, handleData);
        };
    }, [room]);

    useEffect(() => {
        if (!room) return;
        const allowed = allowedSetOf(audioGate);
        const sync = () => {
            for (const participant of room.remoteParticipants.values()) {
                for (const publication of participant.trackPublications.values()) {
                    if (publication.kind !== "audio") continue;
                    const want = !deafen;
                    if (publication.isSubscribed !== want) publication.setSubscribed(want);
                    const track = publication.track;
                    if (track) {
                        const audible = !deafen && allowed !== null && allowed.has(participant.identity);
                        let volume = 0;
                        if (audible) volume = 1;
                        (track as RemoteAudioTrack).setVolume(volume);
                    }
                }
            }
        };
        sync();
        const events = [
            RoomEvent.TrackPublished,
            RoomEvent.TrackSubscribed,
            RoomEvent.TrackUnpublished,
            RoomEvent.ParticipantConnected,
            RoomEvent.ParticipantDisconnected,
        ] as const;
        for (const event of events) room.on(event, sync);
        return () => {
            for (const event of events) room.off(event, sync);
        };
    }, [room, deafen, audioGate]);

    const toggleCam = () => {
        if (!room) return;
        const next = !camOn;
        void room.localParticipant
            .setCameraEnabled(next)
            .then((pub) => {
                setCamOn(next);
                const track = pub?.track;
                if (next && track && track.kind === "video") setVideo(track as LocalVideoTrack);
                reportOwnState(room, "device_cam", next);
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
            .then(() => {
                setMicOn(next);
                reportOwnState(room, "device_mic", next);
            })
            .catch((e: unknown) => setMediaError(mediaErrorOf(e)));
    };

    const setSpeakGate = useCallback((allowed: boolean | null) => {
        if (speakGate.current === allowed) return;
        speakGate.current = allowed;
        let on = micIntent.current;
        if (allowed === false) on = false;
        setMicOn(on); 
        const active = enabledFor.current;
        if (active) {
            void active.localParticipant
                .setMicrophoneEnabled(on)
                .catch((e: unknown) => setMediaError(mediaErrorOf(e)));
        }
    }, []);

    const toggleDeafen = () => {
        setDeafen((prev) => {
            const next = !prev;
            if (room) reportOwnState(room, "device_audio", !next);
            return next;
        });
    };

    const setAudioGate = useCallback((gate: { allowed: string[] } | null) => {
        setAudioGateState((prev) => {
            if (prev === gate) return prev;
            return gate;
        });
    }, []);

    return { status, error, mediaError, video, camOn, micOn, deafen, toggleCam, toggleMic, toggleDeafen, setSpeakGate, setAudioGate };
}


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

export type RtcPeerControlsMap = ReadonlyMap<string, PeerControls>;

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

    const [reportedMicMuted, setReportedMicMuted] = useState<ReadonlySet<string>>(new Set())
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

                if (msg.type === "device_mic") {
                    setReportedMicMuted((prev) => {
                        const next = new Set(prev)
                        if (msg.on!) next.delete(msg.sourceId!)
                        else next.add(msg.sourceId!)
                        return next
                    })
                }

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
        const currentlyOn = !reportedMicMuted.has(id) && peerMicOn(peer?.audio)
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
            const micOn = !reportedMicMuted.has(id) && peerMicOn(peer?.audio)
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

function reportOwnState(room: Room, type: string, on: boolean) {
    const payload = new TextEncoder().encode(
        JSON.stringify({ type, sourceId: room.localParticipant.identity, on })
    )
    void room.localParticipant.publishData(payload, { reliable: true })
}

function publishDeviceOrder(room: Room, type: string, targetId: string, on: boolean) {
    const payload = new TextEncoder().encode(
        JSON.stringify({ type, targetId, on })
    )
    void room.localParticipant.publishData(payload, { reliable: true })
}

function peerMicOn(track: RemoteAudioTrack | undefined): boolean {
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

function applyPeerVideo(room: Room, id: string, visible: boolean) {
    const publication = peerVideoPublication(room, id)
    if (!publication) return
    if (publication.isSubscribed !== visible) publication.setSubscribed(visible)
}

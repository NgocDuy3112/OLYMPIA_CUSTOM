// The WebRTC layer shared by all three surfaces that show player webcams:
// the player's CameraPanel (publish), the console console's PlayerCard rail and the
// public spectator page (both subscribe). One LiveKit room per match.
//
// Decisions this file encodes:
//
// - Tokens come from OUR backend (session-guarded routes), never from env on
//   the client: the role (player/operator/viewer) was already decided server
//   side when the JWT was minted. One POST per connect; the 6 h TTL outlives
//   any match, so reconnects simply re-mint.
// - `identity` of every participant IS the user id (server design) — so the
//   track map is keyed by identity and the console joins it onto CardData.id
//   with plain equality. Spectators appear as `spectator-*` and are simply
//   not in any card list.
// - Players connect with autoSubscribe: false (they publish; nobody wants a
//   feedback loop of four mics in four rooms), viewers with autoSubscribe:
//   true.

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

// ── Tokens ───────────────────────────────────────────────────────────────────

interface RtcToken {
    /** What to dial — the backend's LIVEKIT_URL. */
    url: string;
    token: string;
    /** The participant identity — for players/operators, the user id. */
    identity: string;
    /** Room (match) this token joins. */
    room: string;
    /** Lifetime in seconds. */
    expiresIn: number;
}

/** Seated player: canPublish (+ subscribe granted for a future "see opponents"). */
function fetchPlayerRtcToken(matchId: string): Promise<RtcToken> {
    return api<RtcToken>(`/gameplay/matches/${matchId}/rtc/token`, { method: "POST" });
}

/** console: subscribe-only, hidden participant. */
export function fetchOperatorRtcToken(tournamentId: string, matchId: string): Promise<RtcToken> {
    return api<RtcToken>(
        `/portal/tournaments/${tournamentId}/matches/${matchId}/rtc/token`,
        { method: "POST" }
    );
}

/** Public spectator link: subscribe-only, random hidden identity per viewer. */
// ── The identity → tracks map (pure) ─────────────────────────────────────────

interface RtcPeerTracks {
    video?: RemoteVideoTrack;
    audio?: RemoteAudioTrack;
}

/** Keyed by participant identity (the user id for players). */
type RtcPeerTracksMap = ReadonlyMap<string, RtcPeerTracks>;

// ── Connection lifecycle ─────────────────────────────────────────────────────

export type RtcStatus =
    | "idle"          // not asked to connect (or token not yet fetched)
    | "connecting"    // fetching a token / negotiating
    | "connected"
    | "reconnecting"  // transient — LiveKit retries on its own
    | "disconnected"  // terminal (or kicked: DUPLICATE_IDENTITY, room deleted…)
    | "failed";       // token fetch or initial connect refused

interface RtcRoomError {
    message: string;
    /** HTTP status when the refusal came from OUR token endpoint (ApiError). */
    status?: number;
}

interface RtcRoomHandle {
    room: Room | null;
    status: RtcStatus;
    /** The refusal — `status` lets a caller hide on "not LIVE yet" and shout on real failures. */
    error: RtcRoomError | null;
}

/**
 * Owns ONE Room for as long as `enabled`: mint token → connect → hand the
 * Room back → disconnect and stop local tracks on disable/unmount.
 *
 * `getToken` lives in a ref — a new closure per render must never re-dial
 * (the same rule `useSocketStream` follows for its callback). `resetKey`
 * (e.g. the match id) forces a fresh dial when the room's SUBJECT changes —
 * the route component stays mounted across param changes.
 *
 * The dial's outcome is ONE state tagged with the key it was made for. That is
 * why the effect never has to clear anything on its way in: a snapshot made for
 * a previous key is simply not read, so `status` and `room` derive instead of
 * being pushed through setState synchronously (which would cost a second
 * render on every mount, and a stale first paint on every reset).
 */
export function useRtcRoom(opts: {
    enabled: boolean;
    autoSubscribe: boolean;
    getToken: () => Promise<RtcToken>;
    resetKey?: string;
}): RtcRoomHandle {
    const { enabled, autoSubscribe, resetKey } = opts;

    // Latest-ref, written from an effect (a write during render is what the
    // compiler refuses): declared FIRST so the dial effect below always reads
    // this render's closure.
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

        // Guarded write: a dial that was cancelled (disable, reset) can never
        // clobber the snapshot of the one that replaced it.
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

                // autoSubscribe is a CONNECT option in livekit-client ≥2.x.
                await next.connect(grant.url, grant.token, { autoSubscribe });
                if (cancelled) {
                    // Disabled while negotiating — drop the just-opened room.
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
                // A half-open room from a failed connect still needs tearing down.
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

// One dial attempt, tagged with the key it belongs to (see useRtcRoom).
interface Dial {
    key: string;
    room: Room | null;
    /** The last ConnectionStateChanged — the only source of status after connect. */
    connection: ConnectionState | null;
    error: RtcRoomError | null;
}

function statusOf(enabled: boolean, dial: Dial | null): RtcStatus {
    if (!enabled) return "idle";
    if (!dial) return "connecting";            // a dial for this key is in flight
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

// ── Remote tracks, keyed by identity ────────────────────────────────────────

/**
 * Everything currently subscribed, keyed by participant identity — the exact
 * shape the PlayerCard rail and the spectator grid render from:
 *
 *   const peers = useRtcPeerTracks(room)
 *   const video = peers.get(playerUserId)?.video
 *
 * Seeds from participants already present (events don't replay history), then
 * keeps itself current through subscribe/unsubscribe/leave events. The local
 * participant never appears — a player's own camera is rendered locally by
 * the CameraPanel, not from a remote track.
 */
const EMPTY_PEERS: RtcPeerTracksMap = new Map();
const noop = () => {};

// A livekit Room's participant/track tables are MUTABLE state that the SDK owns
// and announces with events. So instead of mirroring it into React state (which
// means a setState in the effect body, and a stale first paint on every mount),
// the map is DERIVED from the room on read and cached per version: one stable
// object identity until an event says something moved — exactly what
// useSyncExternalStore requires of its snapshot.
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

// Every room event that can change what a viewer sees. Subscribed/unsubscribed
// covers a track coming or going, ParticipantDisconnected a whole participant,
// and Disconnected the end of the room.
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

/**
 * Everything currently subscribed, keyed by participant identity — the exact
 * shape the PlayerCard rail and the spectator grid render from:
 *
 *   const peers = useRtcPeerTracks(room)
 *   const video = peers.get(playerUserId)?.video
 *
 * Reads the room's live tables, so participants already present when the room
 * is handed over are there from the first paint (events don't replay history).
 * The local participant never appears — a player's own camera is rendered
 * locally by the CameraPanel, not from a remote track.
 */
export function useRtcPeerTracks(room: Room | null): RtcPeerTracksMap {
    // Stable per room: useSyncExternalStore re-subscribes whenever the
    // subscribe callback changes identity.
    const subscribe = useCallback(
        (notify: () => void) => (room ? subscribePeers(room, notify) : noop),
        [room]
    );
    const snapshot = useCallback(() => (room ? peersOf(room) : EMPTY_PEERS), [room]);
    return useSyncExternalStore(subscribe, snapshot);
}

// ── THIS player's own broadcast (publish side) ───────────────────────────────

/** Browser media failures in the app's voice; anything else passes through. */
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

/**
 * Everything about THIS player's own camera — the state both the controls
 * (CameraPanel) and the player's own Rail card render from. `video` is a
 * LOCAL track: the Rail attaches it directly, no subscribe involved.
 */
interface SelfBroadcast {
    status: RtcStatus;
    error: RtcRoomError | null;
    /** device/permission failure, in the app's words (see mediaErrorOf). */
    mediaError: string | null;
    video: LocalVideoTrack | null;
    camOn: boolean;
    micOn: boolean;
    toggleCam: () => void;
    toggleMic: () => void;
}

/** Shared between surfaces: provider above the deck, consumers anywhere below. */
export const SelfBroadcastContext = createContext<SelfBroadcast | null>(null);

/** Consumer: null outside a provider (e.g. the portal never broadcasts). */
export function useSelfCam(): SelfBroadcast | null {
    return useContext(SelfBroadcastContext);
}

/**
 * Ask for camera and mic ONCE, then release the tracks.
 *
 * Nothing is published — the grant is the point: the browser dialog then appears
 * while the player is still waiting, instead of at the moment a round starts.
 * Video and audio are asked SEPARATELY on purpose: a refused microphone must not
 * hide a camera that works. Returns the first refusal, in the app's words.
 */
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

/**
 * The provider-side hook: one publish-only room (autoSubscribe: false — this
 * player never plays anyone back) + camera/mic lifecycle. Runs wherever the
 * match route renders; a refused token (409 not LIVE, 403 not seated…) just
 * parks it at `failed` — consumers decide whether to hide.
 */
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
    // Which room already had its devices enabled — a reconnect of the SAME
    // room must not re-enable a camera the player deliberately turned off.
    const enabledFor = useRef<Room | null>(null);
    // The permission probe runs ONCE per match, before any room exists.
    const probed = useRef(false);

    /**
     * ASK ON ARRIVAL, PUBLISH AT LIVE.
     *
     * Publishing needs a token, and a player's token is refused (409) until the
     * match is LIVE — so the permission dialog used to appear at the worst possible
     * moment: mid-show, just as the round starts. The seats' camera can be granted
     * while the player is still waiting, so the probe runs once on arrival and the
     * tracks are released immediately (nothing is published; only the grant is
     * kept). Video and audio are asked SEPARATELY: a refused mic must not hide a
     * camera that is fine.
     */
    useEffect(() => {
        if (probed.current || !matchId) return;
        probed.current = true;
        const devices = typeof navigator === "undefined" ? undefined : navigator.mediaDevices;
        if (!devices?.getUserMedia) return; // insecure context: nothing to ask
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
                await room.localParticipant.setMicrophoneEnabled(true);
            } catch (e) {
                setMediaError((prev) => prev ?? mediaErrorOf(e));
            }
        })();
    }, [room, status]);

    // A terminal disconnect leaves a frozen frame behind — drop it.
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
        const next = !micOn;
        void room.localParticipant
            .setMicrophoneEnabled(next)
            .then(() => setMicOn(next))
            .catch((e: unknown) => setMediaError(mediaErrorOf(e)));
    };

    return { status, error, mediaError, video, camOn, micOn, toggleCam, toggleMic };
}

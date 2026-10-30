// The WebRTC layer shared by all three surfaces that show player webcams:
// the player's CameraPanel (publish), the MC console's PlayerCard rail and the
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

import { createContext, useContext, useEffect, useRef, useState } from "react";
import {
    Room,
    RoomEvent,
    ConnectionState,
    type LocalVideoTrack,
    type RemoteAudioTrack,
    type RemoteParticipant,
    type RemoteTrack,
    type RemoteVideoTrack,
} from "livekit-client";
import { api, ApiError } from "./api";

// ── Tokens ───────────────────────────────────────────────────────────────────

export interface RtcToken {
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
export function fetchPlayerRtcToken(matchId: string): Promise<RtcToken> {
    return api<RtcToken>(`/gameplay/matches/${matchId}/rtc/token`, { method: "POST" });
}

/** MC console: subscribe-only, hidden participant. */
export function fetchOperatorRtcToken(tournamentId: string, matchId: string): Promise<RtcToken> {
    return api<RtcToken>(
        `/portal/tournaments/${tournamentId}/matches/${matchId}/rtc/token`,
        { method: "POST" }
    );
}

/** Public spectator link: subscribe-only, random hidden identity per viewer. */
export function fetchViewerRtcToken(matchId: string): Promise<RtcToken> {
    return api<RtcToken>(`/gameplay/matches/${matchId}/rtc/viewer-token`, { method: "POST" });
}

// ── The identity → tracks map (pure) ─────────────────────────────────────────

export interface RtcPeerTracks {
    video?: RemoteVideoTrack;
    audio?: RemoteAudioTrack;
}

/** Keyed by participant identity (the user id for players). */
export type RtcPeerTracksMap = ReadonlyMap<string, RtcPeerTracks>;

// Immutable updates: React state, and the console re-renders per change.

export function setPeerTrack(
    peers: RtcPeerTracksMap,
    identity: string,
    kind: "audio" | "video",
    track: RemoteAudioTrack | RemoteVideoTrack
): RtcPeerTracksMap {
    const next = new Map(peers);
    const current = next.get(identity) ?? {};
    next.set(identity, { ...current, [kind]: track });
    return next;
}

export function dropPeerTrack(
    peers: RtcPeerTracksMap,
    identity: string,
    kind: "audio" | "video"
): RtcPeerTracksMap {
    const existing = peers.get(identity);
    if (!existing) return peers;
    // Typed by hand: computed-key rest destructuring collapses to {} here.
    const rest: RtcPeerTracks = {};
    if (kind !== "video" && existing.video) rest.video = existing.video;
    if (kind !== "audio" && existing.audio) rest.audio = existing.audio;
    const next = new Map(peers);
    if (rest.video || rest.audio) next.set(identity, rest);
    else next.delete(identity);
    return next;
}

export function dropPeer(peers: RtcPeerTracksMap, identity: string): RtcPeerTracksMap {
    if (!peers.has(identity)) return peers;
    const next = new Map(peers);
    next.delete(identity);
    return next;
}

// ── Connection lifecycle ─────────────────────────────────────────────────────

export type RtcStatus =
    | "idle"          // not asked to connect (or token not yet fetched)
    | "connecting"    // fetching a token / negotiating
    | "connected"
    | "reconnecting"  // transient — LiveKit retries on its own
    | "disconnected"  // terminal (or kicked: DUPLICATE_IDENTITY, room deleted…)
    | "failed";       // token fetch or initial connect refused

export interface RtcRoomError {
    message: string;
    /** HTTP status when the refusal came from OUR token endpoint (ApiError). */
    status?: number;
}

export interface RtcRoomHandle {
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
 */
export function useRtcRoom(opts: {
    enabled: boolean;
    autoSubscribe: boolean;
    getToken: () => Promise<RtcToken>;
    resetKey?: string;
}): RtcRoomHandle {
    const { enabled, autoSubscribe, resetKey } = opts;
    const getToken = useRef(opts.getToken);
    getToken.current = opts.getToken;

    const [room, setRoom] = useState<Room | null>(null);
    const [status, setStatus] = useState<RtcStatus>("idle");
    const [error, setError] = useState<RtcRoomError | null>(null);

    useEffect(() => {
        if (!enabled) {
            setRoom(null);
            setStatus("idle");
            setError(null);
            return;
        }

        let cancelled = false;
        let active: Room | null = null;
        setStatus("connecting");
        setError(null);

        const onState = (state: ConnectionState) => {
            if (state === ConnectionState.Connected) setStatus("connected");
            else if (state === ConnectionState.Reconnecting) setStatus("reconnecting");
            else if (state === ConnectionState.Disconnected) setStatus("disconnected");
            else setStatus("connecting");
        };

        (async () => {
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
                setRoom(next);
                setStatus("connected");
            } catch (e) {
                if (cancelled) return;
                setError({
                    message: e instanceof Error ? e.message : String(e),
                    status: e instanceof ApiError ? e.status : undefined,
                });
                setStatus("failed");
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
            setRoom(null);
        };
    }, [enabled, autoSubscribe, resetKey]);

    return { room, status, error };
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
export function useRtcPeerTracks(room: Room | null): RtcPeerTracksMap {
    const [peers, setPeers] = useState<RtcPeerTracksMap>(() => new Map());

    useEffect(() => {
        if (!room) {
            setPeers(new Map());
            return;
        }

        const seed = (): RtcPeerTracksMap => {
            const next = new Map<string, RtcPeerTracks>();
            for (const [identity, participant] of room.remoteParticipants) {
                const tracks: RtcPeerTracks = {};
                for (const pub of participant.trackPublications.values()) {
                    if (!pub.track) continue;
                    if (pub.track.kind === "video") tracks.video = pub.track as RemoteVideoTrack;
                    else tracks.audio = pub.track as RemoteAudioTrack;
                }
                if (tracks.video || tracks.audio) next.set(identity, tracks);
            }
            return next;
        };

        const onSubscribed = (
            track: RemoteTrack,
            _pub: unknown,
            participant: RemoteParticipant
        ) => {
            if (track.kind === "video") {
                setPeers((prev) => setPeerTrack(prev, participant.identity, "video", track as RemoteVideoTrack));
            } else {
                setPeers((prev) => setPeerTrack(prev, participant.identity, "audio", track as RemoteAudioTrack));
            }
        };
        const onUnsubscribed = (
            track: RemoteTrack,
            _pub: unknown,
            participant: RemoteParticipant
        ) => {
            setPeers((prev) => dropPeerTrack(prev, participant.identity, track.kind === "video" ? "video" : "audio"));
        };
        const onLeave = (participant: RemoteParticipant) => {
            setPeers((prev) => dropPeer(prev, participant.identity));
        };
        const onGone = () => setPeers(new Map());

        room.on(RoomEvent.TrackSubscribed, onSubscribed);
        room.on(RoomEvent.TrackUnsubscribed, onUnsubscribed);
        room.on(RoomEvent.ParticipantDisconnected, onLeave);
        room.on(RoomEvent.Disconnected, onGone);
        setPeers(seed());

        return () => {
            room.off(RoomEvent.TrackSubscribed, onSubscribed);
            room.off(RoomEvent.TrackUnsubscribed, onUnsubscribed);
            room.off(RoomEvent.ParticipantDisconnected, onLeave);
            room.off(RoomEvent.Disconnected, onGone);
        };
    }, [room]);

    return peers;
}

// ── THIS player's own broadcast (publish side) ───────────────────────────────

/** Browser media failures in the app's voice; anything else passes through. */
export function mediaErrorOf(e: unknown): string {
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
export interface SelfBroadcast {
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

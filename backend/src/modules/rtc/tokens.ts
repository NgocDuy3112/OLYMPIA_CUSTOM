import { randomBytes } from "node:crypto";
import { AccessToken } from "livekit-server-sdk";

// LiveKit join tokens — minted server-side AFTER the caller's session (or the
// public link) has decided what they may do. This JWT is a downstream
// credential signed with LIVEKIT_API_SECRET and validated only by the SFU;
// the caller's own identity is verified by the route's guards BEFORE minting,
// so nothing here reads env or request state: config comes in, token goes out.

export type RtcRole = "player" | "operator" | "spectator";

export interface RtcConfig {
    /** What clients dial — http(s)://host:7880 in dev, TLS-terminated in prod. */
    url: string;
    apiKey: string;
    apiSecret: string;
}

export interface MintRtcTokenParams {
    /** The match id — one match = one LiveKit room. */
    room: string;
    role: RtcRole;
    /** Required for player/operator; ignored for spectators. */
    userId?: string;
    /** Participant display name (LiveKit `Participant.name`). */
    name?: string;
}

export interface RtcToken {
    url: string;
    token: string;
    /** The LiveKit participant identity — see `identityFor`. */
    identity: string;
    /** Token lifetime in seconds (mirrors `exp - nbf`). */
    expiresIn: number;
}

// A match outlasts any single round; 6 h covers the longest tournament day and
// still bounds the blast radius of a leaked token. Re-minting on reconnect is
// a cheap POST, so there is no reason to live with a long-lived one.
export const RTC_TOKEN_TTL_SECONDS = 6 * 60 * 60;

const GRANTS: Record<RtcRole, { publish: boolean; hidden: boolean }> = {
    // Players publish cam+mic. The page never subscribes in practice (no peer
    // audio → no feedback loops), but the grant allows subscribe anyway so a
    // future "see your opponents" view needs no token change.
    player: { publish: true, hidden: false },
    // The MC console only watches — it has no camera of its own — and is not a
    // contestant, so it stays out of participant lists.
    operator: { publish: false, hidden: true },
    // Spectators are invisible guests: no publish, never listed. Their fan-out
    // is the SFU's job, not the participant list's.
    spectator: { publish: false, hidden: true },
};

/**
 * - player/operator: identity IS the user id, so the console maps LiveKit
 *   participants onto `CardData.id` with plain equality — and LiveKit's
 *   one-identity-per-room rule enforces exactly ONE feed per contestant (a
 *   second tab kicks the first; two cameras from one player is the worse
 *   failure).
 * - spectator: no user id, and every viewer must be distinct — random suffix.
 */
function identityFor(role: RtcRole, userId: string | undefined): string {
    if (role === "spectator") return `spectator-${randomBytes(8).toString("hex")}`;
    if (!userId) throw new Error(`rtc: userId is required for role ${role}`);
    return userId;
}

export async function mintRtcToken(
    config: RtcConfig,
    params: MintRtcTokenParams
): Promise<RtcToken> {
    const grant = GRANTS[params.role];
    const identity = identityFor(params.role, params.userId);

    const accessToken = new AccessToken(config.apiKey, config.apiSecret, {
        identity,
        ttl: RTC_TOKEN_TTL_SECONDS,
        ...(params.name ? { name: params.name } : {}),
    });
    accessToken.addGrant({
        roomJoin: true,
        room: params.room,
        canPublish: grant.publish,
        canSubscribe: true,
        hidden: grant.hidden,
    });

    const token = await accessToken.toJwt();
    return {
        url: config.url,
        token,
        identity,
        expiresIn: RTC_TOKEN_TTL_SECONDS,
    };
}

/**
 * Routes refuse to mint when false: no config = webcams feature off (dev/CI
 * without LIVEKIT_*), partial config = misconfiguration. Same 503 either way —
 * a half-set config must never silently produce a token that cannot join.
 */
export function isRtcConfigured(config: {
    url?: string;
    apiKey?: string;
    apiSecret?: string;
}): config is RtcConfig {
    return Boolean(config.url && config.apiKey && config.apiSecret);
}

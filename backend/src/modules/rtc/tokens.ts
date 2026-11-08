import { randomBytes } from "node:crypto";
import { AccessToken } from "livekit-server-sdk";


export type RtcRole = "player" | "operator" | "spectator";

export interface RtcConfig {
    url: string;
    apiKey: string;
    apiSecret: string;
}

export interface MintRtcTokenParams {
    room: string;
    role: RtcRole;
    userId?: string;
    name?: string;
}

export interface RtcToken {
    url: string;
    token: string;
    identity: string;
    expiresIn: number;
}

export const RTC_TOKEN_TTL_SECONDS = 6 * 60 * 60;

const GRANTS: Record<RtcRole, { publish: boolean; hidden: boolean }> = {
    player: { publish: true, hidden: false },
    operator: { publish: false, hidden: true },
    spectator: { publish: false, hidden: true },
};

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

export function isRtcConfigured(config: {
    url?: string;
    apiKey?: string;
    apiSecret?: string;
}): config is RtcConfig {
    return Boolean(config.url && config.apiKey && config.apiSecret);
}

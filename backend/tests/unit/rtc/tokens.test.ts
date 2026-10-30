import { describe, expect, it } from "vitest";
import { TokenVerifier } from "livekit-server-sdk";
import {
    RTC_TOKEN_TTL_SECONDS,
    isRtcConfigured,
    mintRtcToken,
    type MintRtcTokenParams,
    type RtcConfig,
} from "../../../src/modules/rtc/tokens.js";

// The token is a real JWT — verify it with the SDK's own verifier (signature +
// expiry included), then assert the GRANTS, which are the security-relevant
// part: what each role may do inside the room.

const config: RtcConfig = {
    url: "http://localhost:7880",
    apiKey: "oc_test_key",
    apiSecret: "test-secret-of-at-least-32-characters-0123456789",
};

const verifier = new TokenVerifier(config.apiKey, config.apiSecret);

async function minted(params: MintRtcTokenParams) {
    const token = await mintRtcToken(config, params);
    return { token, claims: await verifier.verify(token.token) };
}

describe("mintRtcToken", () => {
    it("player: identity is the user id, may publish AND subscribe", async () => {
        const { token, claims } = await minted({ room: "match-42", role: "player", userId: "u-7" });

        expect(token.identity).toBe("u-7");
        expect(claims.sub).toBe("u-7");
        expect(claims.video).toMatchObject({
            room: "match-42",
            roomJoin: true,
            canPublish: true,
            canSubscribe: true,
        });
        expect(claims.video?.hidden).not.toBe(true);
        expect(token.url).toBe("http://localhost:7880");
    });

    it("operator: subscribes but cannot publish, and stays out of the list", async () => {
        const { claims } = await minted({ room: "match-42", role: "operator", userId: "mc-1" });

        expect(claims.sub).toBe("mc-1");
        expect(claims.video).toMatchObject({
            roomJoin: true,
            canPublish: false,
            canSubscribe: true,
            hidden: true,
        });
    });

    it("spectator: random identity, hidden, subscribe-only", async () => {
        const first = await minted({ room: "match-42", role: "spectator" });
        const second = await minted({ room: "match-42", role: "spectator" });

        expect(first.token.identity).toMatch(/^spectator-[0-9a-f]{16}$/);
        expect(first.claims.sub).toBe(first.token.identity);
        // Two viewers must never share an identity — LiveKit would kick one.
        expect(second.token.identity).not.toBe(first.token.identity);
        expect(first.claims.video).toMatchObject({
            roomJoin: true,
            canPublish: false,
            canSubscribe: true,
            hidden: true,
        });
    });

    it("carries the display name when given (players/operators only)", async () => {
        const { claims } = await minted({
            room: "m",
            role: "player",
            userId: "u-7",
            name: "Ngọc Duy",
        });
        expect(claims.name).toBe("Ngọc Duy");
    });

    it("refuses a player/operator token without a user id", async () => {
        await expect(minted({ room: "m", role: "player" })).rejects.toThrow(/userId/);
        await expect(minted({ room: "m", role: "operator" })).rejects.toThrow(/userId/);
    });

    it("expires after the documented TTL", async () => {
        const { claims } = await minted({ room: "m", role: "spectator" });
        const now = Math.floor(Date.now() / 1000);
        expect(claims.exp).toBeDefined();
        expect(Math.abs((claims.exp ?? 0) - (now + RTC_TOKEN_TTL_SECONDS))).toBeLessThan(10);
    });
});

describe("isRtcConfigured", () => {
    const full = { url: "http://localhost:7880", apiKey: "k", apiSecret: "s" };

    it("accepts a complete config", () => {
        expect(isRtcConfigured(full)).toBe(true);
    });

    it("rejects empty AND partially set configs the same way", () => {
        expect(isRtcConfigured({})).toBe(false);
        expect(isRtcConfigured({ ...full, apiKey: undefined })).toBe(false);
        expect(isRtcConfigured({ ...full, apiSecret: undefined })).toBe(false);
        // url is set but the signing pair is not — must never half-mint
        expect(isRtcConfigured({ ...full, url: undefined })).toBe(false);
    });
});

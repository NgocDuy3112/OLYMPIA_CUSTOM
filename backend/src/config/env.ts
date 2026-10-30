import { buildDatabaseUrl } from "./database-url.js";


function required(variableName: string): string {
    const value = process.env[variableName];
    if (!value) throw new Error(`Missing required environment variable: ${variableName}`);
    return value;
}


function optional(variableName: string): string | undefined {
    return process.env[variableName] || undefined;
}


function port(): number {
    const raw = process.env.PORT ?? "3000";
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 1 || value > 65535) {
        throw new Error(`Invalid PORT: ${raw}`);
    }
    return value;
}


export const env = {
    nodeEnv: process.env.NODE_ENV ?? "development",
    isProduction: (process.env.NODE_ENV ?? "development") === "production",
    port: port(),

    databaseUrl: buildDatabaseUrl(),

    gameplay: {
        jwtSecret: required("GAMEPLAY_JWT_SECRET"),
        cookieDomain: optional("GAMEPLAY_COOKIE_DOMAIN"),
    },

    portal: {
        jwtSecret: required("PORTAL_JWT_SECRET"),
        cookieDomain: optional("PORTAL_COOKIE_DOMAIN"),
    },

    googleOidc: {
        issuer: optional("GOOGLE_OIDC_ISSUER"),
        clientId: optional("GOOGLE_OIDC_CLIENT_ID"),
        clientSecret: optional("GOOGLE_OIDC_CLIENT_SECRET"),
        redirectUri: optional("GOOGLE_OIDC_REDIRECT_URI"),
    },

    s3: {
        endpoint: optional("S3_ENDPOINT"),
        region: optional("S3_REGION"),
        bucket: optional("S3_BUCKET"),
        accessKeyId: optional("S3_ACCESS_KEY_ID"),
        secretAccessKey: optional("S3_SECRET_ACCESS_KEY"),
    },

    // LiveKit (the WebRTC SFU for player webcams) — optional by design: without
    // these the rtc routes answer 503 and everything else runs untouched, so
    // dev boxes and CI never need the vars. A PARTIALLY set trio still refuses
    // (isRtcConfigured) — a typo must not mint a token that cannot join.
    livekit: {
        url: optional("LIVEKIT_URL"),
        apiKey: optional("LIVEKIT_API_KEY"),
        apiSecret: optional("LIVEKIT_API_SECRET"),
    },
} as const;


export type Env = typeof env;
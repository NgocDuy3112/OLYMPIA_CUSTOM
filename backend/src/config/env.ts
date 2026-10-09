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

    databaseUrl: required("DATABASE_URL"),

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
} as const;


export type Env = typeof env;
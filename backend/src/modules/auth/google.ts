import { and, eq } from "drizzle-orm";
import {
    authorizationCodeGrant,
    buildAuthorizationUrl,
    calculatePKCECodeChallenge,
    discovery,
    randomNonce,
    randomPKCECodeVerifier,
    randomState,
    type Configuration,
} from "openid-client";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { env } from "../../config/env.js";
import {
    verifyOauthPending,
    signOauthPending,
    signToken,
    type OauthPendingToken,
} from "../../lib/jwt.js";
import { setSessionCookie } from "../../lib/cookies.js";
import { db } from "../../db/pool.js";
import { oauthAccounts, users } from "../../db/schema/auth.js";

const OAUTH_PENDING_COOKIE = "oauth_pending";
const PENDING_MAX_AGE_SECONDS = 10 * 60;
const REDIRECT_PATH = "/gameplay/auth/google";

interface GoogleClaims {
    sub: string;
    email?: string;
    email_verified?: boolean;
    name?: string;
    picture?: string;
}

class SignInError extends Error { }

function googleEnv() {
    const { issuer, clientId, clientSecret, redirectUri } = env.googleOidc;
    if (!issuer || !clientId || !clientSecret || !redirectUri) {
        throw new SignInError(
            "Google OIDC is not configured: set GOOGLE_OIDC_ISSUER, GOOGLE_OIDC_CLIENT_ID, " +
            "GOOGLE_OIDC_CLIENT_SECRET, GOOGLE_OIDC_REDIRECT_URI"
        );
    }
    return { issuer, clientId, clientSecret, redirectUri };
}

let configPromise: Promise<Configuration> | undefined;
function getConfig(): Promise<Configuration> {
    configPromise ??= discovery(
        new URL(googleEnv().issuer),
        googleEnv().clientId,
        googleEnv().clientSecret
    ).catch((error) => {
        configPromise = undefined;
        throw error;
    });
    return configPromise;
}

function setPendingCookie(reply: FastifyReply, pending: OauthPendingToken) {
    reply.setCookie(OAUTH_PENDING_COOKIE, signOauthPending(reply.server, pending), {
        httpOnly: true,
        secure: env.isProduction,
        sameSite: "lax",
        path: REDIRECT_PATH,
        maxAge: PENDING_MAX_AGE_SECONDS,
    });
}

function clearPendingCookie(reply: FastifyReply) {
    reply.clearCookie(OAUTH_PENDING_COOKIE, { path: REDIRECT_PATH });
}

function isUniqueViolation(error: unknown): boolean {
    return (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code?: unknown }).code === "23505"
    );
}


async function provisionPlayer(claims: GoogleClaims) {
    const [linked] = await db
        .select()
        .from(oauthAccounts)
        .where(and(eq(oauthAccounts.provider, "google"), eq(oauthAccounts.sub, claims.sub)))
        .limit(1);

    if (linked) {
        const [user] = await db
            .select()
            .from(users)
            .where(eq(users.id, linked.userId))
            .limit(1);
        if (!user) throw new Error("OAuth account points to a missing user");
        if (user.disabledAt) throw new SignInError("Account disabled");

        const displayName = claims.name ?? user.displayName;
        const avatarUrl = claims.picture ?? user.avatarUrl;
        await db
            .update(users)
            .set({ displayName, avatarUrl, updatedAt: new Date() })
            .where(eq(users.id, user.id));
        return { ...user, displayName, avatarUrl };
    }

    const email = claims.email;
    if (!email || !claims.email_verified) {
        throw new SignInError("Your Google account has no verified email address");
    }

    const [byEmail] = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

    if (byEmail) {
        if (byEmail.disabledAt) throw new SignInError("Account disabled");
        await db.insert(oauthAccounts).values({
            userId: byEmail.id,
            provider: "google",
            sub: claims.sub,
        });
        return byEmail;
    }

    return await db.transaction(async (tx) => {
        const [created] = await tx
            .insert(users)
            .values({
                role: "PLAYER",
                email,
                emailVerified: true,
                displayName: claims.name ?? email,
                avatarUrl: claims.picture,
            })
            .returning();

        await tx.insert(oauthAccounts).values({
            userId: created!.id,
            provider: "google",
            sub: claims.sub,
        });
        return created!;
    });
}


async function findOrCreatePlayer(claims: GoogleClaims) {
    try {
        return await provisionPlayer(claims);
    } catch (error) {
        if (!isUniqueViolation(error)) throw error;

        const [linked] = await db
            .select()
            .from(oauthAccounts)
            .where(
                and(eq(oauthAccounts.provider, "google"), eq(oauthAccounts.sub, claims.sub))
            )
            .limit(1);
        if (!linked) throw error;

        const [user] = await db
            .select()
            .from(users)
            .where(eq(users.id, linked.userId))
            .limit(1);
        if (!user) throw new Error("OAuth account points to a missing user");
        if (user.disabledAt) throw new SignInError("Account disabled");
        return user;
    }
}


export async function googleAuthRoutes(app: FastifyInstance) {
    const perIp = { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } };

    // Step 1: send the player to Google
    app.get("/gameplay/auth/google", perIp, async (request, reply) => {
        const config = await getConfig();
        const { redirectUri } = googleEnv();

        const state = randomState();
        const nonce = randomNonce();
        const codeVerifier = randomPKCECodeVerifier();
        const codeChallenge = await calculatePKCECodeChallenge(codeVerifier);

        const url = buildAuthorizationUrl(config, {
            redirect_uri: redirectUri,
            scope: "openid email profile",
            state,
            nonce,
            code_challenge: codeChallenge,
            code_challenge_method: "S256",
        });

        setPendingCookie(reply, { state, nonce, codeVerifier, purpose: "oauth" });
        return reply.redirect(url.toString());
    });

    app.get("/gameplay/auth/google/callback", perIp, async (request: FastifyRequest, reply) => {
        const raw = request.cookies[OAUTH_PENDING_COOKIE];
        if (!raw) {
            throw app.httpErrors.badRequest("OAuth state missing or expired, start again");
        }
        let pending: OauthPendingToken;
        try {
            pending = verifyOauthPending(app, raw);
        } catch {
            clearPendingCookie(reply);
            throw app.httpErrors.badRequest("OAuth state invalid, start again");
        }
        if (pending.purpose !== "oauth") {
            throw app.httpErrors.badRequest("Invalid OAuth state");
        }

        const currentUrl = new URL(
            request.url,
            `${request.protocol}://${request.headers.host}`
        );

        let tokens;
        try {
            tokens = await authorizationCodeGrant(await getConfig(), currentUrl, {
                expectedState: pending.state,
                expectedNonce: pending.nonce,
            });
        } catch (error) {
            clearPendingCookie(reply);
            app.log.error({ err: error }, "Google code exchange failed");
            throw app.httpErrors.badRequest("Google sign-in failed, try again");
        }

        const claims = tokens.claims() as GoogleClaims | undefined;
        if (!claims?.sub) {
            throw app.httpErrors.badRequest("Google returned no identity");
        }

        let user;
        try {
            user = await findOrCreatePlayer(claims);
        } catch (error) {
            app.log.error({ err: error }, "Player provisioning failed");
            throw app.httpErrors.forbidden(
                error instanceof SignInError ? error.message : "Sign-in failed"
            );
        }

        clearPendingCookie(reply);
        const sessionToken = signToken(app, "GAMEPLAY", {
            sub: user.id,
            role: user.role,
            tv: user.tokenVersion,
        });
        setSessionCookie(reply, "GAMEPLAY", sessionToken);
        return reply.redirect("/");
    });
}
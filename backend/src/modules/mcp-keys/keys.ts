import { createHash, randomBytes } from "node:crypto";

// Wire format: ocmcp_<8 hex prefix>_<64 hex secret>
// The prefix is DISPLAY ONLY (lists, logs, support) — verification always looks
// up by sha256 hash, so the raw token is never stored and never recoverable.
const TOKEN_MARKER = "ocmcp";
const PREFIX_HEX_BYTES = 4;
const SECRET_HEX_BYTES = 32;

export interface GeneratedMcpKey {
    token: string;
    prefix: string;
    keyHash: string;
}

// SHA-256 (not argon2): verification is a single indexed lookup on key_hash,
// which is only possible because the hash is deterministic and unsalted.
export function hashMcpKey(token: string): string {
    return createHash("sha256").update(token).digest("hex");
}

export function parseMcpKey(token: string): { prefix: string } | null {
    const parts = token.split("_");
    if (parts.length !== 3) return null;

    const [marker, prefix, secret] = parts;
    if (marker !== TOKEN_MARKER) return null;
    if (prefix.length !== PREFIX_HEX_BYTES * 2) return null;
    if (secret.length !== SECRET_HEX_BYTES * 2) return null;

    return { prefix };
}

export function generateMcpKey(): GeneratedMcpKey {
    const prefix = randomBytes(PREFIX_HEX_BYTES).toString("hex");
    const secret = randomBytes(SECRET_HEX_BYTES).toString("hex");
    const token = `${TOKEN_MARKER}_${prefix}_${secret}`;

    return { token, prefix, keyHash: hashMcpKey(token) };
}

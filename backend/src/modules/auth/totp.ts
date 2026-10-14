import { generateSecret, generateURI, verify } from "otplib";

const EPOCH_TOLERANCE_SECONDS = 30; // ±1 window: covers typing delay + clock drift

export function newTotpSecret(): string {
    return generateSecret();
}

export function otpauthUri(secret: string, accountName: string): string {
    return generateURI({ issuer: "Olympia", label: accountName, secret });
}

export async function verifyTotpCode(
    secret: string,
    code: string,
    lastUsedStep: number | null
): Promise<number | null> {
    let result;
    try {
        result = await verify({
            token: code,
            secret,
            epochTolerance: EPOCH_TOLERANCE_SECONDS,
        });
    } catch {
        return null;
    }

    if (!result.valid || !("timeStep" in result)) return null;

    const step = result.timeStep;
    if (lastUsedStep !== null && step <= lastUsedStep) return null;

    return step;
}
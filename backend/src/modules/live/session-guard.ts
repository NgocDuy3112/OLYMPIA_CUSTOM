// A WebSocket authenticates once, at upgrade. HTTP re-checks the session on every request
// (disabled account, tokenVersion revocation), but a long-lived socket would otherwise
// outlive the session that opened it. Re-check on an interval and close when it no longer
// holds.

export const SESSION_CHECK_MS = 30_000;

export interface SessionGuardOptions {
    check: () => Promise<boolean>;
    onInvalid: () => void;
    intervalMs?: number;
}

// Returns a stop function; call it when the socket closes for any reason.
export function attachSessionGuard(options: SessionGuardOptions): () => void {
    let stopped = false;
    let running = false;

    const stop = () => {
        stopped = true;
        clearInterval(timer);
    };

    const timer = setInterval(async () => {
        // Never overlap checks, and never act after the socket has gone.
        if (stopped || running) return;
        running = true;
        try {
            const valid = await options.check();
            if (!valid && !stopped) {
                stop();
                options.onInvalid();
            }
        } catch {
            // A transient database error must not drop a live player; retry next tick.
        } finally {
            running = false;
        }
    }, options.intervalMs ?? SESSION_CHECK_MS);

    return stop;
}

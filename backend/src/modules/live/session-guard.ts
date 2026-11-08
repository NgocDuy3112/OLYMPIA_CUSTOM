export const SESSION_CHECK_MS = 30_000;

export interface SessionGuardOptions {
    check: () => Promise<boolean>;
    onInvalid: () => void;
    intervalMs?: number;
}

export function attachSessionGuard(options: SessionGuardOptions): () => void {
    let stopped = false;
    let running = false;

    const stop = () => {
        stopped = true;
        clearInterval(timer);
    };

    const timer = setInterval(async () => {
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

export interface PingableSocket {
    ping(): void;
    terminate(): void;
    on(event: "pong" | "close", listener: () => void): unknown;
}

export const HEARTBEAT_MS = 15_000;   

export function attachHeartbeat(
    socket: PingableSocket,
    intervalMs: number = HEARTBEAT_MS
): () => void {
    let alive = true;

    const onPong = () => { alive = true; };
    socket.on("pong", onPong);

    const timer = setInterval(() => {
        if (!alive) {
            try { socket.terminate(); } catch { /* already closed */ }
            return;
        }
        alive = false;
        try {
            socket.ping();
        } catch {
            try { socket.terminate(); } catch { /* already closed */ }
        }
    }, intervalMs);

    let stopped = false;
    const stop = () => {
        if (stopped) return;
        stopped = true;
        clearInterval(timer);
    };

    socket.on("close", stop);
    return stop;
}

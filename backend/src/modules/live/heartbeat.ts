// Liveness for a WebSocket. A player who closes the laptop or walks out of WiFi leaves a
// half-open socket: writes appear to succeed, and the hub keeps pushing into it. Ping on
// an interval, and terminate the socket when a pong is missed.
//
// Browsers answer protocol ping frames automatically and invisibly to JS, so this needs
// nothing from the client.

export interface PingableSocket {
    ping(): void;
    terminate(): void;
    on(event: "pong" | "close", listener: () => void): unknown;
}

export const HEARTBEAT_MS = 15_000;   // dead sockets detected within ~2 intervals

// Returns a stop function; call it when the socket closes for any reason.
export function attachHeartbeat(
    socket: PingableSocket,
    intervalMs: number = HEARTBEAT_MS
): () => void {
    let alive = true;

    const onPong = () => { alive = true; };
    socket.on("pong", onPong);

    const timer = setInterval(() => {
        if (!alive) {
            // No pong since the last ping: the peer is gone.
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

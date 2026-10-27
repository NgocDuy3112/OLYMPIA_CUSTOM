// A tiny per-match fan-out. Subscribers (one per connected player) are asked to push
// their own view when the round changes. In-memory and single-process by design: if the
// server is ever scaled out, this becomes a shared bus (e.g. Postgres LISTEN/NOTIFY).

export interface Subscriber {
    userId: string;
    push: () => Promise<void>;
}

const byMatch = new Map<string, Set<Subscriber>>();

export function subscribe(matchId: string, subscriber: Subscriber): () => void {
    let set = byMatch.get(matchId);
    if (!set) {
        set = new Set();
        byMatch.set(matchId, set);
    }
    set.add(subscriber);

    return () => {
        set!.delete(subscriber);
        if (set!.size === 0) byMatch.delete(matchId);
    };
}

// Best-effort: a subscriber that fails to push is skipped, never breaking the action
// that triggered the publish.
export async function publish(matchId: string): Promise<void> {
    const set = byMatch.get(matchId);
    if (!set || set.size === 0) return;
    await Promise.all([...set].map(async (subscriber) => {
        try {
            await subscriber.push();
        } catch {
            // the socket will be cleaned up by its own close handler
        }
    }));
}

export function subscriberCount(matchId: string): number {
    return byMatch.get(matchId)?.size ?? 0;
}

/** The user ids with a live socket right now — the MC's "connected" dots. */
export function connectedUsers(matchId: string): string[] {
    const set = byMatch.get(matchId);
    if (!set) return [];
    return [...new Set([...set].map((subscriber) => subscriber.userId))];
}

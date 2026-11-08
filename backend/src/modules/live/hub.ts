export interface Subscriber {
    userId: string;
    push: () => Promise<void>;
}

export const CONSOLE_SUBSCRIBER = "__console__";

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

export function connectedUsers(matchId: string): string[] {
    const set = byMatch.get(matchId);
    if (!set) return [];
    return [...new Set([...set].map((subscriber) => subscriber.userId))]
        .filter((id) => id !== CONSOLE_SUBSCRIBER);
}

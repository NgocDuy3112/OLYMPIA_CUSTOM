import { useEffect, useState } from "react";
import { API_BASE_URL } from "@/configs";

const EXT_TO_MIME: Record<string, string> = {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
    gif: "image/gif", webp: "image/webp", svg: "image/svg+xml",
    mp3: "audio/mpeg", ogg: "audio/ogg", wav: "audio/wav",
    aac: "audio/aac", m4a: "audio/mp4", flac: "audio/flac",
    mp4: "video/mp4", webm: "video/webm", ogv: "video/ogg", mov: "video/quicktime",
};

function mimeFromPath(path: string): string | null {
    const ext = path.split(".").pop()?.toLowerCase() ?? "";
    return EXT_TO_MIME[ext] ?? null;
}

export function isS3Key(url: string): boolean {
    return url.startsWith("OC3_M") && url.includes("/");
}

const presignCache = new Map<string, string>();
const pendingKeys = new Set<string>();
let batchTimer: ReturnType<typeof setTimeout> | null = null;
const BATCH_DELAY_MS = 50;
const BATCH_MAX_KEYS = 50;

async function flushBatch(): Promise<void> {
    if (pendingKeys.size === 0) return;
    const keys = Array.from(pendingKeys).slice(0, BATCH_MAX_KEYS);
    keys.forEach((k) => pendingKeys.delete(k));
    try {
        const res = await fetch(`${API_BASE_URL}/media/presign-batch/`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                // Session is authenticated by httpOnly cookie.
                "X-Requested-With": "XMLHttpRequest",
            },
            body: JSON.stringify({ keys }),
        });
        if (!res.ok) throw new Error(`presign-batch HTTP ${res.status}`);
        const { urls } = (await res.json()) as { urls: Record<string, string> };
        for (const [k, u] of Object.entries(urls)) {
            presignCache.set(k, u);
        }
    } catch (err) {
        console.error("[useS3Media] presign-batch failed:", err);
        keys.forEach((k) => pendingKeys.add(k));
    }
}

export async function prefetchS3Media(
    keys: string[],
    _token?: string,
): Promise<void> {
    const s3Keys = keys.filter((k) => isS3Key(k) && !presignCache.has(k));
    s3Keys.forEach((k) => pendingKeys.add(k));
    if (batchTimer) clearTimeout(batchTimer);

    if (pendingKeys.size >= BATCH_MAX_KEYS) {
        await flushBatch();
    } else {
        batchTimer = setTimeout(() => {
            void flushBatch();
        }, BATCH_DELAY_MS);
    }
}

export interface S3MediaState {

    src: string | null;
    mimeType: string | null;
    loading: boolean;
    error: string | null;
}

export function useS3Media(
    mediaUrl: string | undefined,
    _token?: string,
): S3MediaState {
    const [state, setState] = useState<S3MediaState>({
        src: null,
        mimeType: null,
        loading: false,
        error: null,
    });

    useEffect(() => {
        if (!mediaUrl) {
            setState({ src: null, mimeType: null, loading: false, error: null });
            return;
        }

        if (mediaUrl.startsWith("http://") || mediaUrl.startsWith("https://")) {
            setState({ src: mediaUrl, mimeType: null, loading: false, error: null });
            return;
        }

        const cached = presignCache.get(mediaUrl);
        if (cached) {
            setState({ src: cached, mimeType: mimeFromPath(mediaUrl), loading: false, error: null });
            return;
        }

        let cancelled = false;
        setState((prev) => ({ ...prev, loading: true, error: null }));

        const run = async () => {
            try {
                const res = await fetch(
                    `${API_BASE_URL}/media/presign/?key=${encodeURIComponent(mediaUrl)}`,
                    { credentials: "include" },
                );
                if (!res.ok) throw new Error(`Presign failed: HTTP ${res.status}`);
                const { url } = await res.json() as { url: string };
                if (cancelled) return;
                presignCache.set(mediaUrl, url);
                setState({ src: url, mimeType: mimeFromPath(mediaUrl), loading: false, error: null });
            } catch (err) {
                if (cancelled) return;
                console.error("[useS3Media] Failed to load media:", mediaUrl, err);
                setState({
                    src: null,
                    mimeType: null,
                    loading: false,
                    error: err instanceof Error ? err.message : "Unknown error",
                });
            }
        };

        void run();
        return () => {
            cancelled = true;
        };
    }, [mediaUrl]);

    return state;
}

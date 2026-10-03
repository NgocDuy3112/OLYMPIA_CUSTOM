import { useCallback, useEffect, useState } from "react";
import { API_BASE_URL } from "@/configs";

const isRemoteUrl = (value: string) => /^https?:\/\//i.test(value);

const MAX_RETRY = 1;

export async function resolveAvatarUrl(key: string): Promise<string> {
  const path = key.split("/").map(encodeURIComponent).join("/");
  const res = await fetch(`${API_BASE_URL}/media/presign/${path}`, {
    credentials: "include",
  });
  const json = await res.json();
  if (!res.ok || json.status !== "success") {
    throw new Error(json.message ?? "Không tạo được URL avatar");
  }
  return json.data.url as string;
}

export function useAvatarSrc(
  avatarUrl?: string | null,
): { src: string | null; loading: boolean; retry: () => void } {
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    if (!avatarUrl) {
      setSrc(null);
      setLoading(false);
      return;
    }
    if (isRemoteUrl(avatarUrl)) {
      setSrc(avatarUrl);
      setLoading(false);
      return;
    }
    setSrc(null);
    setLoading(true);
    resolveAvatarUrl(avatarUrl)
      .then((url) => {
        if (alive) setSrc(url);
      })
      .catch(() => {
        if (alive) setSrc(null);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [avatarUrl, attempt]);

  const retry = useCallback(() => {
    if (!avatarUrl) return;
    if (isRemoteUrl(avatarUrl) || attempt >= MAX_RETRY) {
      setSrc(null);
      return;
    }
    setAttempt((a) => a + 1);
  }, [avatarUrl, attempt]);

  return { src, loading, retry };
}

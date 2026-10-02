import { useEffect, useState } from "react";
import { API_BASE_URL } from "@/configs";

/** Google avatar là URL tuyệt đối; avatar upload lưu S3 key (avatars/...). */
const isRemoteUrl = (value: string) => /^https?:\/\//i.test(value);

/** Đổi S3 key → presigned GET URL (backend: GET /media/presign/*). */
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

/**
 * Avatar src cho cả 2 loại giá trị trong DB (URL Google / S3 key).
 * Trả null khi chưa resolve được → caller fallback về chữ cái đầu.
 */
export function useAvatarSrc(
  avatarUrl?: string | null,
): { src: string | null; loading: boolean } {
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
        if (alive) setSrc(null); // fallback initials
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [avatarUrl]);

  return { src, loading };
}

import { apiCall } from "@/api/client";
import { putFileWithProgress } from "@/lib/upload";

export async function uploadQuestionMedia(
  code: string,
  file: File,
  onProgress?: (pct: number) => void,
): Promise<string> {
  const okType =
    file.type.startsWith("image/") ||
    file.type.startsWith("audio/") ||
    file.type.startsWith("video/");
  if (!okType) throw new Error("Chỉ nhận ảnh/audio/video.");
  if (file.size > 50 * 1024 * 1024) throw new Error("File tối đa 50MB.");
  const key = `questions/${code}.${extOf(file)}`;
  const presign = await apiCall<{ url: string }>(
    `/media/presign-question/?key=${encodeURIComponent(key)}&contentType=${encodeURIComponent(file.type)}`,
  );
  const putUrl = presign.data!.url;
  await putFileWithProgress(putUrl, file, onProgress);
  return key;
}

function extOf(file: File): string {
  const raw = file.name
    .split(".")
    .pop()
    ?.toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  if (raw) return raw;
  if (file.type.startsWith("image/"))
    return file.type.includes("png") ? "png" : "jpg";
  if (file.type.startsWith("audio/")) return "mp3";
  return "mp4";
}

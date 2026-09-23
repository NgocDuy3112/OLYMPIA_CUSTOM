import { API_BASE_URL } from "@/configs";

interface PresignResponse {
  status: "success" | "error";
  message: string;
  data: unknown;
}

/**
 * Upload 1 file ảnh/audio/video lên S3 qua presign-put rồi trả về key.
 * Key phẳng theo mã câu: questions/<CODE>.<ext> — 1 câu 1 file,
 * upload mới ghi đè file cũ.
 */
export async function uploadQuestionMedia(
  code: string,
  file: File,
): Promise<string> {
  const okType =
    file.type.startsWith("image/") ||
    file.type.startsWith("audio/") ||
    file.type.startsWith("video/");
  if (!okType) throw new Error("Chỉ nhận ảnh/audio/video.");
  if (file.size > 50 * 1024 * 1024) throw new Error("File tối đa 50MB.");
  const key = `questions/${code}.${extOf(file)}`;
  const presignRes = await fetch(
    `${API_BASE_URL}/media/presign-question/?key=${encodeURIComponent(key)}&contentType=${encodeURIComponent(file.type)}`,
    { credentials: "include" },
  );
  const presignJson: PresignResponse = await presignRes.json();
  if (!presignRes.ok || presignJson.status !== "success") {
    throw new Error(presignJson.message ?? "Không tạo được upload URL");
  }
  const putUrl = (presignJson.data as { url: string }).url;
  const putRes = await fetch(putUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  });
  if (!putRes.ok) throw new Error("Upload file thất bại");
  return key;
}

/** Extension sạch từ tên file, fallback theo mime khi tên không có. */
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

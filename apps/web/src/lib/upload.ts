/**
 * PUT file lên presigned URL có tiến độ — fetch không có progress event,
 * nên dùng XHR. Dùng chung cho upload media câu hỏi + avatar.
 */
export function putFileWithProgress(
  url: string,
  file: File,
  onProgress?: (pct: number) => void,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    if (file.type) xhr.setRequestHeader("Content-Type", file.type);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.min(100, Math.round((e.loaded / e.total) * 100)));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error("Upload file thất bại"));
    };
    xhr.onerror = () => reject(new Error("Lỗi kết nối khi upload file"));
    xhr.send(file);
  });
}

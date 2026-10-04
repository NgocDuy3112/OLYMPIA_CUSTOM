import { API_BASE_URL } from "@/configs";

export interface ApiResponse<T> {
  status: "success" | "error";
  message: string;
  data: T | null;
}

export function getApiErrorMessage(
  error: unknown,
  fallback = "Request failed",
): string {
  if (error instanceof ApiError) return error.message || fallback;
  return fallback;
}

export function unwrapApiData<T>(response: ApiResponse<T>): T | null {
  return response.data;
}

export class ApiError extends Error {
  readonly status: number;
  readonly details?: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export async function requestJson<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has("Content-Type"))
    headers.set("Content-Type", "application/json");

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
    credentials: "include",
  });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = getResponseError(data) ?? `HTTP ${response.status}`;
    throw new ApiError(detail, response.status, data);
  }
  return data as T;
}


export async function apiCall<T>(
  path: string,
  options: RequestInit = {},
): Promise<ApiResponse<T>> {
  const body = await requestJson<ApiResponse<T>>(path, options);
  if (body && body.status === "error") {
    throw new ApiError(body.message || "Request failed", 0, body.data);
  }
  return body;
}

export function apiGet<T>(path: string): Promise<ApiResponse<T>> {
  return apiCall<T>(path);
}

/**
 * GET nhưng trả về `null` khi API báo lỗi (HTTP != 200 hoặc `status: "error"`),
 * dành cho chỗ chỉ cần dữ liệu rỗng thay vì bắt lỗi thủ công.
 * Lỗi mạng vẫn ném ra ngoài để caller xử lý như `apiGet`.
 */
export function apiGetOrNull<T>(path: string): Promise<ApiResponse<T> | null> {
  return apiGet<T>(path).catch((error: unknown) => {
    if (error instanceof ApiError) return null;
    throw error;
  });
}

export function apiSend<T>(
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
): Promise<ApiResponse<T>> {
  return apiCall<T>(path, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function getResponseError(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const body = data as { detail?: unknown; message?: unknown };
  if (Array.isArray(body.detail)) {
    const messages = body.detail
      .map((item) =>
        typeof item === "object" && item !== null && "msg" in item
          ? String(item.msg)
          : String(item),
      )
      .filter(Boolean);
    return messages.join("; ") || null;
  }
  if (typeof body.detail === "string" && body.detail) return body.detail;
  if (typeof body.message === "string" && body.message) return body.message;
  return null;
}

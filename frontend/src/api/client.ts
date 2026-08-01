import { API_BASE_URL } from "@/configs";

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
  token?: string,
): Promise<T> {
  const headers = new Headers(options.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  const response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = typeof data === "object" && data !== null && "detail" in data
      ? String(data.detail)
      : `HTTP ${response.status}`;
    throw new ApiError(detail, response.status, data);
  }
  return data as T;
}

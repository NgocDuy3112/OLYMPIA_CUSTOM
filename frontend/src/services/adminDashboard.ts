import { API_BASE_URL } from "@/configs";

const ADMIN_TOKEN_KEY = "jwtToken_admin";

export class MissingEndpointError extends Error {
	public readonly endpoint: string;

	constructor(endpoint: string, message?: string) {
		super(message ?? `Endpoint ${endpoint} chưa được triển khai trên backend.`);
		this.name = "MissingEndpointError";
		this.endpoint = endpoint;
	}
}

type Role = "guest" | "player" | "admin";

export interface AdminUserSummary {
	user_code: string;
	user_name: string;
	role: Role;
}

export interface MatchSummary {
	match_code: string;
	match_name: string;
}

export interface QuestionDetail {
	question_code: string;
	content: string;
	answer: string;
	explanation?: string | null;
	media_urls?: string[] | null;
}

export const PARTICIPANT_SLOT_COUNT = 4;

type BaseResponseEnvelope<T> = {
	status: "success" | "error";
	message: string;
	data: T;
};

type PossibleEnvelope<T> = BaseResponseEnvelope<T> | { response: BaseResponseEnvelope<T> } | null | undefined;

const ensureAdminHeaders = (options?: { includeJson?: boolean }) => {
	const token = localStorage.getItem(ADMIN_TOKEN_KEY);
	if (!token) {
		throw new Error("Vui lòng đăng nhập với tài khoản admin để tiếp tục.");
	}

	const headers: Record<string, string> = {
		Authorization: `Bearer ${token}`,
	};

	if (options?.includeJson) {
		headers["Content-Type"] = "application/json";
	}

	return headers;
};

const normalizeEnvelope = <T>(payload: PossibleEnvelope<T>): BaseResponseEnvelope<T> => {
	if (!payload) {
		return { status: "error", message: "Phản hồi rỗng từ máy chủ", data: null as T };
	}

	if ("response" in payload && payload.response) {
		return payload.response as BaseResponseEnvelope<T>;
	}

	return payload as BaseResponseEnvelope<T>;
};

const detectMissingEndpoint = async (response: Response, endpoint: string) => {
	if (![404, 405, 501].includes(response.status)) {
		return;
	}

	try {
		const clone = response.clone();
		const maybeJson = await clone.json();
		const detail = maybeJson?.detail ?? maybeJson?.message;
		if (!detail || detail === "Not Found") {
			throw new MissingEndpointError(endpoint);
		}
	} catch {
		throw new MissingEndpointError(endpoint);
	}
};

const parseResponse = async <T>(response: Response, endpoint: string): Promise<BaseResponseEnvelope<T>> => {
	const payload = await response.json().catch(() => null);

	if (!response.ok) {
		const detail = payload?.detail ?? payload?.message ?? response.statusText;
		throw new Error(detail || `Yêu cầu tới ${endpoint} thất bại.`);
	}

	const normalized = normalizeEnvelope<T>(payload as PossibleEnvelope<T>);
	if (normalized.status !== "success") {
		throw new Error(normalized.message || `Yêu cầu tới ${endpoint} trả về lỗi.`);
	}

	return normalized;
};

export const fetchUsers = async (): Promise<AdminUserSummary[]> => {
	const response = await fetch(`${API_BASE_URL}/users/`, {
		headers: ensureAdminHeaders(),
	});

	await detectMissingEndpoint(response, "GET /users/");

	const payload = await parseResponse<AdminUserSummary[] | { users: AdminUserSummary[] }>(response, "GET /users/");
	const data = payload.data;

	if (Array.isArray(data)) {
		return data;
	}

	if (data && Array.isArray((data as { users?: AdminUserSummary[] }).users)) {
		return (data as { users?: AdminUserSummary[] }).users ?? [];
	}

	return [];
};

export const fetchMatchInfo = async (matchCode: string): Promise<MatchSummary | null> => {
	if (!matchCode) {
		return null;
	}

	const params = new URLSearchParams({ match_code: matchCode });
	const response = await fetch(`${API_BASE_URL}/matches?${params.toString()}`, {
		headers: ensureAdminHeaders(),
	});

	const payload = await parseResponse<MatchSummary>(response, "GET /matches?match_code");
	return payload.data ?? null;
};

export const fetchMatchParticipants = async (matchCode: string): Promise<string[]> => {
	if (!matchCode) {
		return [];
	}

	const response = await fetch(`${API_BASE_URL}/matches/${matchCode}/participants`, {
		headers: ensureAdminHeaders(),
	});

	await detectMissingEndpoint(response, "GET /matches/{match_code}/participants");

	const payload = await parseResponse<string[] | { user_codes: string[] }>(response, "GET /matches/{match_code}/participants");
	const data = payload.data;

	if (Array.isArray(data)) {
		return data;
	}

	if (data && Array.isArray((data as { user_codes?: string[] }).user_codes)) {
		return (data as { user_codes?: string[] }).user_codes ?? [];
	}

	return [];
};

export const upsertMatchParticipants = async (matchCode: string, userCodes: string[]): Promise<void> => {
	const response = await fetch(`${API_BASE_URL}/matches/${matchCode}/participants`, {
		method: "PUT",
		headers: ensureAdminHeaders({ includeJson: true }),
		body: JSON.stringify({
			match_code: matchCode,
			user_codes: userCodes,
		}),
	});

	await detectMissingEndpoint(response, "PUT /matches/{match_code}/participants");
	await parseResponse<unknown>(response, "PUT /matches/{match_code}/participants");
};

export const fetchQuestionDetail = async (matchCode: string, questionCode: string): Promise<QuestionDetail | null> => {
	if (!matchCode || !questionCode) {
		return null;
	}

	const params = new URLSearchParams({
		match_code: matchCode,
		question_code: questionCode,
	});

	const response = await fetch(`${API_BASE_URL}/questions?${params.toString()}`, {
		headers: ensureAdminHeaders(),
	});

	await detectMissingEndpoint(response, "GET /questions?match_code&question_code");

	const payload = await parseResponse<QuestionDetail | QuestionDetail[] | null>(response, "GET /questions");
	const data = payload.data;

	if (!data) {
		return null;
	}

	if (Array.isArray(data)) {
		return data[0] ?? null;
	}

	return data;
};

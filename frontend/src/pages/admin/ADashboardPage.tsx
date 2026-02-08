import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertCircle, Loader2, Users } from "lucide-react";
import {
	fetchMatchParticipants,
	fetchQuestionDetail,
	fetchUsers,
	MissingEndpointError,
	PARTICIPANT_SLOT_COUNT,
	upsertMatchParticipants,
} from "@/services/adminDashboard";
import type { AdminUserSummary, QuestionDetail } from "@/services/adminDashboard";

type RequestState = {
	loading: boolean;
	error: string | null;
	missingEndpoint: string | null;
};

type RoomActionStatus = "idle" | "loading" | "success" | "error";

const createRequestState = (loading = false): RequestState => ({
	loading,
	error: null,
	missingEndpoint: null,
});

const buildEmptyParticipantSlots = () => Array.from({ length: PARTICIPANT_SLOT_COUNT }, () => "");

const ADashboardPage: React.FC = () => {
	const navigate = useNavigate();
	const [users, setUsers] = useState<AdminUserSummary[]>([]);
	const [usersState, setUsersState] = useState<RequestState>(() => createRequestState(true));

	const [matchCode, setMatchCode] = useState<string>("");

	const [participantCodes, setParticipantCodes] = useState<string[]>(() => buildEmptyParticipantSlots());
	const [participantState, setParticipantState] = useState<RequestState>(createRequestState());

	const [roomActionState, setRoomActionState] = useState<{ status: RoomActionStatus; message: string | null }>({
		status: "idle",
		message: null,
	});

	const [questionCode, setQuestionCode] = useState<string>("");
	const [questionDetail, setQuestionDetail] = useState<QuestionDetail | null>(null);
	const [questionState, setQuestionState] = useState<RequestState>(createRequestState());

	const handleMatchCodeChange = (value: string) => {
		const normalized = value.toUpperCase();
		setMatchCode(normalized);
		if (!normalized.trim()) {
			setParticipantCodes(buildEmptyParticipantSlots());
			setParticipantState(createRequestState());
			setRoomActionState({ status: "idle", message: null });
			setQuestionCode("");
			setQuestionDetail(null);
			setQuestionState(createRequestState());
		}
	};

	const handleQuestionCodeChange = (value: string) => {
		const normalized = value.toUpperCase();
		setQuestionCode(normalized);
		if (!normalized.trim()) {
			setQuestionDetail(null);
			setQuestionState(createRequestState());
		}
	};

	const sanitizedMatchCode = useMemo(() => matchCode.trim().toUpperCase(), [matchCode]);
	const sanitizedQuestionCode = useMemo(() => questionCode.trim().toUpperCase(), [questionCode]);

	const handleNavigateToGame = () => {
		if (!sanitizedMatchCode) return;
		localStorage.setItem("matchCode", sanitizedMatchCode);
		navigate(`/admin/kdr/${sanitizedMatchCode}`);
	};

	useEffect(() => {
		let ignore = false;
		const loadUsers = async () => {
			setUsersState(createRequestState(true));
			try {
				const data = await fetchUsers();
				if (!ignore) {
					setUsers(data);
					setUsersState(createRequestState(false));
				}
			} catch (error) {
				if (ignore) return;
				if (error instanceof MissingEndpointError) {
					setUsersState({ loading: false, error: error.message, missingEndpoint: error.endpoint });
					return;
				}
				setUsersState({ loading: false, error: (error as Error).message, missingEndpoint: null });
			}
		};

		loadUsers();
		return () => {
			ignore = true;
		};
	}, []);

	useEffect(() => {
		let ignore = false;
		if (!sanitizedMatchCode) {
			return () => {
				ignore = true;
			};
		}

		const timer = setTimeout(async () => {

			setParticipantState((prev) => ({ ...prev, loading: true, error: null }));
			try {
				const codes = await fetchMatchParticipants(sanitizedMatchCode);
				if (!ignore) {
					const mapped = buildEmptyParticipantSlots();
					codes.slice(0, PARTICIPANT_SLOT_COUNT).forEach((code, index) => {
						mapped[index] = code ?? "";
					});
					setParticipantCodes(mapped);
					setParticipantState(createRequestState());
				}
			} catch (error) {
				if (ignore) return;
				if (error instanceof MissingEndpointError) {
					setParticipantState({ loading: false, error: error.message, missingEndpoint: error.endpoint });
				} else {
					setParticipantState({ loading: false, error: (error as Error).message, missingEndpoint: null });
				}
			}
		}, 400);

		return () => {
			ignore = true;
			clearTimeout(timer);
		};
	}, [sanitizedMatchCode]);

	useEffect(() => {
		let ignore = false;
		if (!sanitizedMatchCode || !sanitizedQuestionCode) {
			return () => {
				ignore = true;
			};
		}

		const timer = setTimeout(async () => {
			setQuestionState((prev) => ({ ...prev, loading: true, error: null }));
			try {
				const detail = await fetchQuestionDetail(sanitizedMatchCode, sanitizedQuestionCode);
				if (!ignore) {
					setQuestionDetail(detail);
					setQuestionState(createRequestState());
				}
			} catch (error) {
				if (ignore) return;
				if (error instanceof MissingEndpointError) {
					setQuestionState({ loading: false, error: error.message, missingEndpoint: error.endpoint });
				} else {
					setQuestionState({ loading: false, error: (error as Error).message, missingEndpoint: null });
				}
			}
		}, 450);

		return () => {
			ignore = true;
			clearTimeout(timer);
		};
	}, [sanitizedMatchCode, sanitizedQuestionCode]);

	const handleParticipantChange = (index: number, value: string) => {
		const cleaned = value.toUpperCase();
		setParticipantCodes((prev) => prev.map((code, idx) => (idx === index ? cleaned : code)));
	};

	const handleRoomSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (!sanitizedMatchCode) {
			setRoomActionState({ status: "error", message: "Vui lòng nhập matchCode hợp lệ." });
			return;
		}
		if (!sanitizedMatchCode.startsWith("OC3_M")) {
			setRoomActionState({ status: "error", message: "matchCode phải bắt đầu bằng 'OC3_M'." });
			return;
		}

		const normalizedCodes = participantCodes.map((code) => code.trim().toUpperCase());
		const hasInvalidParticipant = normalizedCodes.some((code) => code && !code.startsWith("OC_U"));
		if (hasInvalidParticipant) {
			setRoomActionState({ status: "error", message: "Mỗi userCode phải bắt đầu bằng 'OC_U'." });
			return;
		}

		setRoomActionState({ status: "loading", message: null });
		try {
			await upsertMatchParticipants(sanitizedMatchCode, normalizedCodes);
			setRoomActionState({ status: "success", message: "Tạo/cập nhật phòng thành công." });
		} catch (error) {
			if (error instanceof MissingEndpointError) {
				setParticipantState({ loading: false, error: error.message, missingEndpoint: error.endpoint });
				setRoomActionState({ status: "error", message: error.message });
				return;
			}
			setRoomActionState({ status: "error", message: (error as Error).message || "Không thể lưu phòng." });
		}
	};

	const renderRequestBanner = (state: RequestState, fallback?: string) => {
		if (state.loading) {
			return (
				<div className="flex items-center gap-2 rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-text-primary">
					<Loader2 className="h-4 w-4 animate-spin" />
					Đang tải dữ liệu...
				</div>
			);
		}
		if (state.error) {
			return (
				<div className="flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
					<AlertCircle className="h-4 w-4" />
					{state.error}
				</div>
			);
		}
		if (state.missingEndpoint) {
			return (
				<div className="rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-sm text-amber-100">
					Endpoint <strong>{state.missingEndpoint}</strong> chưa tồn tại. Hãy cập nhật backend theo schema tương ứng.
				</div>
			);
		}
		if (fallback) {
			return <p className="text-sm text-white/70">{fallback}</p>;
		}
		return null;
	};

	return (
		<div className="min-h-screen bg-bg-base px-4 py-8 text-text-primary">
			<div className="mx-auto flex max-w-7xl flex-col gap-6">
				<header className="text-center text-text-primary">
					<h1 className="text-3xl font-[SVN-Gratelos_Display] font-semibold uppercase tracking-wide text-text-primary md:text-4xl">
						Bảng điều khiển trận đấu
					</h1>
				</header>

				<div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
					<section className="panel p-6 text-text-primary">
						<header className="mb-6 flex items-center gap-3">
							<div className="rounded-2xl bg-white/10 p-3 text-text-primary">
								<Users className="h-5 w-5" />
							</div>
							<div>
								<p className="text-xs font-semibold uppercase tracking-widest text-white/60">Users</p>
								<h2 className="text-2xl font-semibold text-text-primary">Danh sách người dùng</h2>
							</div>
						</header>

						<div className="space-y-3">
							{renderRequestBanner(usersState, "Thông tin được cập nhật realtime từ backend.")}
							{!usersState.loading && !usersState.error && !usersState.missingEndpoint && (
								<div className="divide-y divide-white/10 rounded-2xl border border-(--oc-border) bg-[color-mix(in srgb, var(--oc-card-bg) 70%, #040825 30%)]">
									{users.map((user) => (
										<div key={user.user_code} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
											<div>
												<p className="text-sm font-medium text-white/60">user_code</p>
												<p className="font-semibold text-text-primary">{user.user_code}</p>
											</div>
											<div>
												<p className="text-sm font-medium text-white/60">user_name</p>
												<p className="font-semibold text-text-primary">{user.user_name}</p>
											</div>
											<div className="self-start rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-text-primary sm:self-auto">
												{user.role}
											</div>
										</div>
									))}
									{users.length === 0 && (
										<p className="px-4 py-6 text-center text-sm text-white/70">Chưa có người dùng nào được trả về từ API.</p>
									)}
								</div>
							)}
						</div>
					</section>

					<section className="panel p-6 text-text-primary border">
						<header className="mb-6">
							<p className="text-xs font-semibold uppercase tracking-widest text-white/60">Tạo phòng</p>
							<h2 className="text-2xl font-semibold text-text-primary">Thiết lập trận đấu</h2>
							<p className="text-sm text-white/70">Nhập mã trận đấu và các mã thí sinh để tạo hoặc cập nhật phòng thi.</p>
						</header>

						<form className="space-y-6" onSubmit={handleRoomSubmit}>
							<div className="space-y-2">
								<label className="text-sm font-semibold text-white/70" htmlFor="match-code-input">
									Mã trận đấu
								</label>
								<input
									id="match-code-input"
									type="text"
									value={sanitizedMatchCode}
									onChange={(event) => handleMatchCodeChange(event.target.value)}
									placeholder="OC3_M..."
									className="w-full rounded-xl border border-white/20 bg-white/5 px-4 py-2.5 text-sm font-medium uppercase tracking-wide text-text-primary outline-none transition placeholder-white/50 focus:border-primary focus:ring-2 focus:ring-primary/50"
								/>
							</div>


							<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
								{participantCodes.map((code, index) => (
									<div key={`participant-${index}`} className="space-y-1">
										<label className="text-xs font-semibold uppercase tracking-wide text-white/60" htmlFor={`user-code-${index}`}>
											Mã thí sinh {index + 1}
										</label>
										<input
											id={`user-code-${index}`}
											type="text"
											value={code}
											onChange={(event) => handleParticipantChange(index, event.target.value)}
											placeholder="OC_U..."
											className="w-full rounded-xl border border-white/20 bg-white/5 px-4 py-2 text-sm font-medium uppercase tracking-wide text-text-primary outline-none transition placeholder-white/50 focus:border-primary focus:ring-2 focus:ring-primary/50"
										/>
									</div>
								))}
							</div>

							{renderRequestBanner(participantState)}

							<div className="space-y-3">
								<button
									type="submit"
									disabled={roomActionState.status === "loading"}
									className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold uppercase tracking-wide border-2 border-white text-white transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
								>
									{roomActionState.status === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
									{roomActionState.status === "loading" ? "Đang lưu" : "Lưu cấu hình"}
								</button>
								{roomActionState.message && (
									<div
										className={`rounded-xl border px-4 py-3 text-sm ${roomActionState.status === "success"
											?
												"border-primary/40 bg-primary/10 text-primary"
											:
												"border-red-500/40 bg-red-500/10 text-red-200"
											}`}
									>
										{roomActionState.message}
									</div>
								)}
								<button
									type="button"
									onClick={handleNavigateToGame}
									disabled={!sanitizedMatchCode}
									className="flex w-full items-center justify-center gap-2 rounded-xl border border-(--oc-border) bg-transparent px-4 py-2.5 text-sm font-semibold uppercase tracking-wide text-white transition hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-60"
								>
									Đi tới trang điều khiển
								</button>
							</div>
						</form>
					</section>

					<section className="panel p-6 text-text-primary lg:col-span-2">
						<header className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
							<div>
								<p className="text-xs font-semibold uppercase tracking-widest text-white/60">Câu hỏi</p>
								<p className="text-sm text-white/70"></p>
							</div>
						</header>

						<div className="grid grid-cols-1 gap-4 md:grid-cols-3">
							<div className="space-y-1">
								<label className="text-xs font-semibold uppercase tracking-wide text-white/60" htmlFor="question-match-code">
									Mã trận đấu
								</label>
								<input
									id="question-match-code"
									type="text"
									value={sanitizedMatchCode}
									onChange={(event) => handleMatchCodeChange(event.target.value)}
									placeholder="OC3_M..."
									className="w-full rounded-xl border border-white/20 bg-white/5 px-4 py-2 text-sm font-semibold uppercase tracking-wide text-text-primary outline-none transition placeholder-white/50 focus:border-primary focus:ring-2 focus:ring-primary/50"
								/>
							</div>
							<div className="space-y-1">
								<label className="text-xs font-semibold uppercase tracking-wide text-white/60" htmlFor="question-code-input">
									Mã câu hỏi
								</label>
								<input
									id="question-code-input"
									type="text"
									value={sanitizedQuestionCode}
									onChange={(event) => handleQuestionCodeChange(event.target.value)}
									placeholder="OC3_Q..."
									className="w-full rounded-xl border border-white/20 bg-white/5 px-4 py-2 text-sm font-semibold uppercase tracking-wide text-text-primary outline-none transition placeholder-white/50 focus:border-primary focus:ring-2 focus:ring-primary/50"
								/>
							</div>
							<div className="self-end text-sm text-white/70">
								{questionState.loading ? (
									<span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1">
										<Loader2 className="h-4 w-4 animate-spin" />
										Đang tải câu hỏi
									</span>
								) : (
									<span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1">
										{questionDetail ? "Đã đồng bộ" : "Chưa có dữ liệu"}
									</span>
								)}
							</div>
						</div>

						<div className="mt-6 space-y-4">
							{renderRequestBanner(questionState)}
							{questionDetail && (
								<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
									<div className="rounded-2xl border border-white/10 bg-white/5 p-4">
										<p className="text-xs font-semibold uppercase tracking-wide text-white/60">question_code</p>
										<p className="text-base font-semibold text-text-primary">{questionDetail.question_code}</p>
									</div>
									<div className="rounded-2xl border border-white/10 bg-white/5 p-4">
										<p className="text-xs font-semibold uppercase tracking-wide text-white/60">answer</p>
										<p className="text-base font-semibold text-secondary">{questionDetail.answer}</p>
									</div>
									<div className="rounded-2xl border border-white/10 bg-white/5 p-4 md:col-span-2">
										<p className="text-xs font-semibold uppercase tracking-wide text-white/60">content</p>
										<p className="text-base text-text-primary">{questionDetail.content}</p>
									</div>
									{questionDetail.explanation && (
										<div className="rounded-2xl border border-white/10 bg-white/5 p-4 md:col-span-2">
											<p className="text-xs font-semibold uppercase tracking-wide text-white/60">explanation</p>
											<p className="text-base text-text-primary">{questionDetail.explanation}</p>
										</div>
									)}
									<div className="rounded-2xl border border-white/10 bg-white/5 p-4 md:col-span-2">
										<p className="text-xs font-semibold uppercase tracking-wide text-white/60">media_urls</p>
										{questionDetail.media_urls && questionDetail.media_urls.length > 0 ? (
											<div className="mt-2 flex flex-wrap gap-2">
												{questionDetail.media_urls.map((url) => (
													<a
														key={url}
														href={url}
														target="_blank"
														rel="noreferrer"
														className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-semibold text-text-primary hover:bg-primary/10"
													>
														<span className="truncate max-w-48">{url}</span>
													</a>
												))}
											</div>
										) : (
											<p className="mt-2 text-sm text-white/70">Không có media đính kèm.</p>
										)}
									</div>
								</div>
							)}
						</div>
					</section>
				</div>
			</div>
		</div>
	);
};

export default ADashboardPage;




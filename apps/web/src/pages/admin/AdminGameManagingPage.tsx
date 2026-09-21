import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search,
  Plus,
  RefreshCw,
  Gamepad2,
  HelpCircle,
  Pencil,
  X,
  FileSpreadsheet,
  Trash2,
  ChevronDown,
  Paperclip,
} from "lucide-react";
import { API_BASE_URL } from "@/configs";
import { createLogger } from "@/utils/logger";
import {
  getMatchCode as readStoredMatchCode,
  setMatchCode as persistMatchCode,
} from "@/utils/storage";

const logger = createLogger("AdminGameManaging");

const VaoPhongButton = ({
  matchCode,
  disabled,
}: {
  matchCode: string;
  disabled?: boolean;
}) => {
  const navigate = useNavigate();
  const handleClick = () => {
    const codeToUse = matchCode || readStoredMatchCode();
    if (!codeToUse) {
      alert("Vui lòng nhập Mã trận đấu trước khi Vào trận đấu.");
      return;
    }
    persistMatchCode(codeToUse);
    navigate(`/controller/waiting/${codeToUse}`);
  };

  return (
    <button
      onClick={handleClick}
      disabled={disabled}
      className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-blue-500 hover:bg-blue-400 disabled:opacity-50 font-medium transition-colors"
    >
      Vào trận đấu
    </button>
  );
};

interface MatchData {
  match_code: string;
  match_name: string;
  match_status?: string;
}

interface QuestionData {
  question_code: string;
  content: string;
  answer: string;
  explanation: string | null;
  media_url: string | null;
}

interface ApiResponse {
  status: "success" | "error";
  message: string;
  data: Record<string, unknown> | Record<string, unknown>[] | null;
}

const AdminGameManagingPage = () => {
  const [allMatches, setAllMatches] = useState<MatchData[]>([]);
  const [allMatchesLoading, setAllMatchesLoading] = useState(false);

  const [matchCode, setMatchCode] = useState(readStoredMatchCode());
  const [matchName, setMatchName] = useState("");
  const [userCodes, setUserCodes] = useState<string[]>(["", "", "", ""]);

  const [userInputs, setUserInputs] = useState<string[]>(["", "", "", ""]);
  const [matchExists, setMatchExists] = useState(false);
  const [matchLoading, setMatchLoading] = useState(false);

  const [questions, setQuestions] = useState<QuestionData[]>([]);
  const [questionsLoading, setQuestionsLoading] = useState(false);
  const [questionsMatchCode, setQuestionsMatchCode] = useState(
    readStoredMatchCode(),
  );
  const [showImportMenu, setShowImportMenu] = useState(false);
  const importMenuRef = useRef<HTMLDivElement>(null);

  const [editingQuestion, setEditingQuestion] = useState<QuestionData | null>(
    null,
  );
  const [editQContent, setEditQContent] = useState("");
  const [editQAnswer, setEditQAnswer] = useState("");
  const [editQExplanation, setEditQExplanation] = useState("");
  const [editQMediaUrl, setEditQMediaUrl] = useState("");
  const [editQMediaFile, setEditQMediaFile] = useState<File | null>(null);
  const [savingQuestionEdit, setSavingQuestionEdit] = useState(false);
  const editMediaInputRef = useRef<HTMLInputElement>(null);
  const [uploadingExcel, setUploadingExcel] = useState(false);
  const [uploadingExcelQl, setUploadingExcelQl] = useState(false);
  const excelInputRef = useRef<HTMLInputElement>(null);
  const excelQlInputRef = useRef<HTMLInputElement>(null);

  const authHeaders = useCallback(
    (): HeadersInit => ({
      "Content-Type": "application/json",
    }),
    [],
  );

  useEffect(() => {
    if (editingQuestion && !editQMediaFile) {
      const codeToUse = questionsMatchCode || matchCode;
      if (codeToUse && editingQuestion.question_code) {
        const ext = editQMediaUrl
          ? editQMediaUrl.split(".").pop() || "png"
          : "png";
        const suggestedKey = `${codeToUse}/${editingQuestion.question_code}.${ext}`;

        if (!editQMediaUrl || editQMediaUrl.startsWith(codeToUse)) {
          setEditQMediaUrl(suggestedKey);
        }
      }
    }
  }, [
    editQMediaUrl,
    editingQuestion,
    questionsMatchCode,
    matchCode,
    editQMediaFile,
  ]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (
        importMenuRef.current &&
        !importMenuRef.current.contains(e.target as Node)
      ) {
        setShowImportMenu(false);
      }
    };
    if (showImportMenu) {
      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }
  }, [showImportMenu]);

  const lookupMatchByCode = useCallback(
    async (code: string) => {
      if (!code) return;
      setMatchLoading(true);
      try {
        const res = await fetch(
          `${API_BASE_URL}/matches/?match_code=${encodeURIComponent(code)}`,
          { headers: authHeaders() },
        );
        const json: ApiResponse = await res.json();
        if (
          json.status === "success" &&
          json.data &&
          !Array.isArray(json.data)
        ) {
          const match = json.data as unknown as MatchData;
          setMatchName(match.match_name);
          setMatchExists(true);

          try {
            const playersRes = await fetch(
              `${API_BASE_URL}/matches/${encodeURIComponent(code)}/players`,
              { headers: authHeaders() },
            );
            const playersJson = await playersRes.json();
            const playersList: { user_code: string; user_name?: string }[] =
              playersJson.response?.data?.players ??
              playersJson.data?.players ??
              (Array.isArray(playersJson.data) ? playersJson.data : []);

            const paddedCodes = ["", "", "", ""];
            const paddedNames = ["", "", "", ""];
            playersList.slice(0, 4).forEach((p, idx) => {
              paddedCodes[idx] = p.user_code ?? "";
              paddedNames[idx] = p.user_name ?? p.user_code ?? "";
            });
            setUserCodes(paddedCodes);
            setUserInputs(paddedNames);
          } catch {
            logger.warn("Could not load players for match", code);
          }
        } else {
          setMatchExists(false);
        }
      } catch (err) {
        logger.error("Error looking up match:", err);
        setMatchExists(false);
      } finally {
        setMatchLoading(false);
      }
    },
    [authHeaders],
  );

  const fetchAllMatches = useCallback(async () => {
    setAllMatchesLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/matches/all`, {
        headers: authHeaders(),
      });
      const json: ApiResponse = await res.json();
      if (json.status === "success" && Array.isArray(json.data)) {
        setAllMatches(json.data as unknown as MatchData[]);
      } else {
        logger.warn("Fetch all matches failed:", json.message);
      }
    } catch (err) {
      logger.error("Error fetching all matches:", err);
    } finally {
      setAllMatchesLoading(false);
    }
  }, [authHeaders]);

  const createMatch = useCallback(async () => {
    if (!matchCode || !matchName) return;
    const activePlayers = userCodes.filter((code) => code.trim() !== "");
    if (activePlayers.length < 2) {
      alert("Trận đấu cần tối thiểu 2 thí sinh.");
      return;
    }
    setMatchLoading(true);

    const players = userCodes
      .map((code, index) => ({
        user_code: code.trim(),
        position: index + 1,
      }))
      .filter((p) => p.user_code !== "");

    try {
      let res: Response;
      if (!matchExists) {
        res = await fetch(`${API_BASE_URL}/matches/`, {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            match_code: matchCode,
            match_name: matchName,
            players,
          }),
        });
      } else {
        res = await fetch(
          `${API_BASE_URL}/matches/${encodeURIComponent(matchCode)}`,
          {
            method: "PATCH",
            headers: authHeaders(),
            body: JSON.stringify({
              match_name: matchName,
              players,
            }),
          },
        );
      }

      const json = await res.json();
      if (res.ok) {
        logger.info("Match saved:", matchCode);
        setMatchExists(true);
        persistMatchCode(matchCode);
        await fetchAllMatches();
        alert(
          matchExists
            ? "Cập nhật trận đấu thành công"
            : "Tạo trận đấu thành công",
        );
      } else {
        const errMsg = json.detail ?? json.message ?? "Lỗi không xác định";
        logger.warn("Match operation failed:", errMsg);
        alert(`Thất bại: ${errMsg}`);
      }
    } catch (err) {
      logger.error("Error saving match:", err);
      alert("Lỗi kết nối khi lưu phòng");
    } finally {
      setMatchLoading(false);
    }
  }, [
    authHeaders,
    matchCode,
    matchName,
    userCodes,
    matchExists,
    fetchAllMatches,
  ]);

  const fetchQuestions = useCallback(async () => {
    const code = questionsMatchCode || matchCode;
    if (!code) return;
    setQuestionsLoading(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/questions/?match_code=${encodeURIComponent(code)}`,
        { headers: authHeaders() },
      );
      const json: ApiResponse = await res.json();
      if (json.status === "success" && Array.isArray(json.data)) {
        setQuestions(json.data as unknown as QuestionData[]);
      } else if (
        json.status === "success" &&
        json.data &&
        !Array.isArray(json.data)
      ) {
        setQuestions([json.data as unknown as QuestionData]);
      } else {
        setQuestions([]);
        logger.warn("Fetch questions failed:", json.message);
      }
    } catch (err) {
      logger.error("Error fetching questions:", err);
    } finally {
      setQuestionsLoading(false);
    }
  }, [authHeaders, matchCode, questionsMatchCode]);

  const patchQuestion = useCallback(async () => {
    if (!editingQuestion) return;
    const code = questionsMatchCode || matchCode;
    setSavingQuestionEdit(true);
    try {
      let mediaUrl = editQMediaUrl.trim() || null;

      if (editQMediaFile) {
        const ext = editQMediaFile.name.split(".").pop() || "png";
        const s3Key = `${code}/${editingQuestion.question_code}.${ext}`;

        const formData = new FormData();
        formData.append("file", editQMediaFile);

        const uploadRes = await fetch(
          `${API_BASE_URL}/media/upload/?match_code=${encodeURIComponent(code)}`,
          {
            method: "POST",
            headers: authHeaders(),
            body: formData,
          },
        );

        if (uploadRes.ok) {
          const uploadJson = await uploadRes.json();
          mediaUrl = uploadJson.key || s3Key;
          logger.info(`Media uploaded successfully: ${mediaUrl}`);
        } else {
          logger.warn("Media upload failed, using existing media URL");
        }
      }

      const body: Record<string, string | null> = {
        content: editQContent.trim() || null,
        answer: editQAnswer.trim() || null,
        explanation: editQExplanation.trim() || null,
        media_url: mediaUrl,
      };
      const res = await fetch(
        `${API_BASE_URL}/questions/${encodeURIComponent(code)}/${encodeURIComponent(editingQuestion.question_code)}`,
        { method: "PATCH", headers: authHeaders(), body: JSON.stringify(body) },
      );
      const json: ApiResponse = await res.json();
      if (json.status === "success") {
        setEditingQuestion(null);
        setEditQMediaFile(null);
        if (editMediaInputRef.current) editMediaInputRef.current.value = "";
        await fetchQuestions();
      } else {
        alert(`Thất bại: ${json.message ?? "Lỗi không xác định"}`);
      }
    } catch (err) {
      logger.error("Error patching question:", err);
      alert("Lỗi kết nối khi sửa câu hỏi");
    } finally {
      setSavingQuestionEdit(false);
    }
  }, [
    authHeaders,
    editingQuestion,
    editQContent,
    editQAnswer,
    editQExplanation,
    editQMediaUrl,
    editQMediaFile,
    questionsMatchCode,
    matchCode,
    fetchQuestions,
  ]);

  const uploadExcel = useCallback(
    async (file: File, isQualifier: boolean) => {
      const code = questionsMatchCode || matchCode;
      if (!isQualifier && !code) {
        alert("Vui lòng nhập mã trận đấu trước khi nhập Excel");
        return;
      }
      const setter = isQualifier ? setUploadingExcelQl : setUploadingExcel;
      setter(true);
      try {
        const formData = new FormData();
        formData.append("file", file);
        const url = isQualifier
          ? `${API_BASE_URL}/questions/excel/qualifier/`
          : `${API_BASE_URL}/questions/excel/?match_code=${encodeURIComponent(code)}`;
        const res = await fetch(url, {
          method: "POST",
          headers: authHeaders(),
          body: formData,
        });
        const json: ApiResponse = await res.json();
        if (json.status === "success") {
          alert("Nhập câu hỏi từ Excel thành công");
          await fetchQuestions();
        } else {
          alert(`Nhập Excel thất bại: ${json.message}`);
        }
      } catch (err) {
        logger.error("Error uploading Excel:", err);
        alert("Lỗi khi nhập file Excel");
      } finally {
        setter(false);
      }
    },
    [authHeaders, questionsMatchCode, matchCode, fetchQuestions],
  );

  useEffect(() => {
    void fetchAllMatches();
  }, [fetchAllMatches]);

  const handleUserInputChange = (index: number, value: string) => {
    setUserInputs((prev: string[]) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
    setUserCodes((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 grid-rows-[auto_1fr] lg:grid-rows-[1fr_2fr] gap-3 sm:gap-4 p-3 sm:p-4 lg:p-6 min-h-screen lg:h-screen text-white overflow-auto lg:overflow-hidden">
      {editingQuestion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-blue-950 border border-blue-600 rounded-xl p-6 w-full max-w-md flex flex-col gap-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-blue-200">Sửa câu hỏi</h3>
              <button
                onClick={() => setEditingQuestion(null)}
                className="p-1 rounded hover:bg-blue-800 transition-colors"
              >
                <X size={18} />
              </button>
            </div>
            <p className="text-xs text-blue-400 font-mono -mt-2">
              {editingQuestion.question_code}
            </p>
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-blue-300">Nội dung</label>
                <textarea
                  rows={3}
                  value={editQContent}
                  onChange={(e) => setEditQContent(e.target.value)}
                  className="px-3 py-2 rounded-lg bg-blue-900 border border-blue-700 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm resize-none"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-blue-300">Đáp án</label>
                <input
                  type="text"
                  value={editQAnswer}
                  onChange={(e) => setEditQAnswer(e.target.value)}
                  className="px-3 py-2 rounded-lg bg-blue-900 border border-blue-700 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-blue-300">Giải thích</label>
                <input
                  type="text"
                  value={editQExplanation}
                  onChange={(e) => setEditQExplanation(e.target.value)}
                  placeholder="(tuỳ chọn)"
                  className="px-3 py-2 rounded-lg bg-blue-900 border border-blue-700 text-white placeholder-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-blue-300">
                  Media URL / S3 key
                </label>
                <div className="flex flex-col gap-2">
                  <input
                    type="text"
                    value={editQMediaUrl}
                    onChange={(e) => setEditQMediaUrl(e.target.value)}
                    placeholder="OC3_M01T/OC3_Q_... (VD: OC<number>_M_*/OC<number>_Q_*)"
                    className="px-3 py-2 rounded-lg bg-blue-900 border border-blue-700 text-white placeholder-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono"
                  />
                  <div className="flex items-center gap-2">
                    <input
                      ref={editMediaInputRef}
                      type="file"
                      accept="image/*,audio/*,video/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setEditQMediaFile(file);
                          const ext = file.name.split(".").pop() || "png";
                          const codeToUse = questionsMatchCode || matchCode;
                          const suggestedKey =
                            codeToUse && editingQuestion?.question_code
                              ? `${codeToUse}/${editingQuestion.question_code}.${ext}`
                              : `filename.${ext}`;
                          setEditQMediaUrl(suggestedKey);
                        }
                      }}
                    />
                    <button
                      onClick={() => editMediaInputRef.current?.click()}
                      className="flex-1 px-3 py-2 rounded-lg bg-blue-700 hover:bg-blue-600 text-white text-sm truncate"
                      title="Upload file mới"
                    >
                      {editQMediaFile ? editQMediaFile.name : "Chọn file mới"}
                    </button>
                    {editQMediaFile && (
                      <span className="text-xs text-green-400 whitespace-nowrap">
                        Sẽ upload khi lưu
                      </span>
                    )}
                  </div>
                  {editQMediaUrl && (
                    <div className="text-xs text-blue-300">
                      S3 key: <span className="font-mono">{editQMediaUrl}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setEditingQuestion(null)}
                className="px-4 py-2 rounded-lg bg-blue-800 hover:bg-blue-700 text-sm transition-colors"
              >
                Huỷ
              </button>
              <button
                onClick={patchQuestion}
                disabled={
                  savingQuestionEdit ||
                  !editQContent.trim() ||
                  !editQAnswer.trim()
                }
                className="px-4 py-2 rounded-lg bg-white-600 hover:bg-white-500 disabled:opacity-50 font-semibold text-sm transition-colors"
              >
                {savingQuestionEdit ? "Đang lưu…" : "Lưu thay đổi"}
              </button>
            </div>
          </div>
        </div>
      )}

      {}
      <div className="bg-blue-900/60 ring-4 ring-blue-600 rounded-xl p-5 flex flex-col gap-4 overflow-hidden row-span-2">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-xl font-bold text-blue-300">
            <Gamepad2 size={22} /> Tạo trận đấu & Quản lý trận đấu
          </h2>
          <button
            onClick={fetchAllMatches}
            disabled={allMatchesLoading}
            className="p-2 rounded-lg bg-blue-700 hover:bg-blue-600 disabled:opacity-50 transition-colors"
            title="Làm mới"
          >
            <RefreshCw
              size={16}
              className={allMatchesLoading ? "animate-spin" : ""}
            />
          </button>
        </div>

        {}
        <div className="bg-blue-800/20 border border-blue-700 rounded-lg p-4 flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-blue-300 uppercase tracking-wide">
            Tạo / Cập nhật trận đấu
          </h3>

          {}
          <input
            type="text"
            placeholder="Mã trận đấu"
            value={matchCode}
            onChange={(e) => {
              const val = e.target.value;
              setMatchCode(val);
              setQuestionsMatchCode(val);
              setMatchExists(false);
              persistMatchCode(val);
            }}
            className="px-3 py-2 rounded-lg bg-blue-950 border border-blue-700 text-white placeholder-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          />

          {}
          <input
            type="text"
            placeholder="Tên trận đấu"
            value={matchName}
            onChange={(e) => setMatchName(e.target.value)}
            className="px-3 py-2 rounded-lg bg-blue-950 border border-blue-700 text-white placeholder-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          />

          {}

          <div className="grid grid-cols-2 gap-2">
            {userInputs.map((input, i) => (
              <div key={i} className="relative">
                <input
                  placeholder={`Tên / mã vị trí #${i + 1}`}
                  value={input}
                  onChange={(e) => handleUserInputChange(i, e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-blue-950 border border-blue-700 text-white placeholder-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
                {userCodes[i] && userCodes[i] !== input && (
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-blue-400 font-mono pointer-events-none">
                    {userCodes[i]}
                  </span>
                )}
              </div>
            ))}
          </div>

          {}
          <div className="flex gap-2">
            <button
              onClick={createMatch}
              disabled={
                matchLoading ||
                !matchCode ||
                !matchName ||
                userCodes.filter((c) => c.trim() !== "").length < 2
              }
              className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 font-semibold transition-colors"
            >
              <Plus size={16} />
              {matchExists ? "Cập nhật trận đấu" : "Tạo trận đấu"}
            </button>

            <VaoPhongButton
              matchCode={matchCode}
              disabled={!matchCode || !matchExists}
            />
          </div>
        </div>

        {}
        <div className="border-t border-blue-700 my-2"></div>

        {}
        <div className="flex flex-col gap-2 flex-1 min-h-0">
          <h3 className="text-sm font-semibold text-blue-300 uppercase tracking-wide">
            Danh sách trận đấu
          </h3>
          <div className="overflow-y-auto flex-1 min-h-0 -mr-2 pr-2">
            {allMatchesLoading ? (
              <p className="text-gray-400 text-sm">Đang tải…</p>
            ) : allMatches.length === 0 ? (
              <p className="text-gray-400 text-sm">Chưa có trận đấu nào.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-blue-900">
                  <tr className="text-left text-blue-300 border-b border-blue-700">
                    <th className="py-2 px-2">Mã trận</th>
                    <th className="py-2 px-2">Tên trận đấu</th>
                    <th className="py-2 px-2">Trạng thái</th>
                    <th className="py-2 px-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {allMatches.map((m) => (
                    <tr
                      key={m.match_code}
                      className="border-b border-blue-800/50 hover:bg-blue-800/40 transition-colors cursor-pointer"
                      onClick={() => {
                        setMatchCode(m.match_code);
                        setQuestionsMatchCode(m.match_code);
                        persistMatchCode(m.match_code);
                        setMatchExists(false);
                        void lookupMatchByCode(m.match_code);
                      }}
                    >
                      <td className="py-2 px-2 font-mono text-xs">
                        {m.match_code}
                      </td>
                      <td className="py-2 px-2">{m.match_name}</td>
                      <td className="py-2 px-2 text-xs">
                        {m.match_status === "finished" ? (
                          <span className="text-green-400 font-semibold">
                            ✅ Hoàn thành
                          </span>
                        ) : (
                          <span className="text-blue-300 capitalize">
                            {m.match_status ?? "—"}
                          </span>
                        )}
                      </td>
                      <td
                        className="py-2 px-2 text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex gap-1 justify-end">
                          {m.match_status !== "finished" && (
                            <button
                              onClick={async () => {
                                if (
                                  !confirm(
                                    `Xác nhận hoàn thành trận đấu "${m.match_name}" (${m.match_code})? Hành động này không thể hoàn tác.`,
                                  )
                                )
                                  return;
                                try {
                                  const res = await fetch(
                                    `${API_BASE_URL}/matches/${encodeURIComponent(m.match_code)}/finish`,
                                    {
                                      method: "PATCH",
                                      headers: authHeaders(),
                                    },
                                  );
                                  const json = await res.json();
                                  if (json.status === "success") {
                                    alert("✅ Đã hoàn thành trận đấu!");
                                    await fetchAllMatches();
                                  } else {
                                    alert(
                                      `Lỗi: ${json.message ?? json.detail ?? "Không thể hoàn thành"}`,
                                    );
                                  }
                                } catch (err) {
                                  logger.error("Error finishing match:", err);
                                  alert("Lỗi kết nối khi hoàn thành trận đấu");
                                }
                              }}
                              className="text-xs px-3 py-1 rounded bg-green-700 hover:bg-green-500 transition-colors font-semibold"
                              title="Đánh dấu trận đấu đã hoàn thành"
                            >
                              Hoàn thành
                            </button>
                          )}
                          <button
                            onClick={async () => {
                              if (
                                !confirm(
                                  `Xác nhận xoá trận đấu "${m.match_name}" (${m.match_code})?\nHành động này không thể hoàn tác.`,
                                )
                              )
                                return;
                              try {
                                const res = await fetch(
                                  `${API_BASE_URL}/matches/${encodeURIComponent(m.match_code)}`,
                                  {
                                    method: "DELETE",
                                    headers: authHeaders(),
                                  },
                                );
                                const json = await res.json();
                                if (json.status === "success") {
                                  alert("✅ Đã xoá trận đấu!");
                                  await fetchAllMatches();
                                } else {
                                  alert(
                                    `Lỗi: ${json.message ?? json.detail ?? "Không thể xoá trận đấu"}`,
                                  );
                                }
                              } catch (err) {
                                logger.error("Error deleting match:", err);
                                alert("Lỗi kết nối khi xoá trận đấu");
                              }
                            }}
                            className="p-1.5 rounded bg-red-700/70 hover:bg-red-600 transition-colors"
                            title="Xoá trận đấu"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {}
      <div className="bg-blue-900/60 ring-4 ring-blue-600 rounded-xl p-5 flex flex-col gap-4 overflow-hidden">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-xl font-bold text-blue-300">
            <HelpCircle size={22} /> Câu hỏi
          </h2>
          <div className="flex items-center gap-2">
            {}
            <input
              ref={excelInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void uploadExcel(file, false);
                e.target.value = "";
              }}
            />
            <input
              ref={excelQlInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void uploadExcel(file, true);
                e.target.value = "";
              }}
            />
            <input
              type="text"
              placeholder="Mã trận đấu"
              value={questionsMatchCode}
              onChange={(e) => setQuestionsMatchCode(e.target.value)}
              className="px-3 py-2 rounded-lg bg-blue-950 border border-blue-700 text-white placeholder-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm w-40"
            />
            <button
              onClick={fetchQuestions}
              disabled={questionsLoading || (!questionsMatchCode && !matchCode)}
              className="flex items-center gap-1 px-3 py-2 rounded-lg bg-blue-700 hover:bg-blue-600 disabled:opacity-50 transition-colors text-sm"
            >
              <Search size={14} /> Tải câu hỏi
            </button>
            {}
            <div className="relative" ref={importMenuRef}>
              <button
                onClick={() => setShowImportMenu((v) => !v)}
                className="flex items-center gap-1 px-3 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-600 transition-colors text-sm"
              >
                <FileSpreadsheet size={14} /> Import <ChevronDown size={14} />
              </button>
              {showImportMenu && (
                <div className="absolute right-0 top-full mt-1 z-30 bg-blue-950 border border-blue-700 rounded-lg shadow-xl flex flex-col min-w-[10rem]">
                  <button
                    onClick={() => {
                      excelInputRef.current?.click();
                      setShowImportMenu(false);
                    }}
                    disabled={
                      uploadingExcel || (!questionsMatchCode && !matchCode)
                    }
                    className="flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-blue-800 disabled:opacity-50 transition-colors"
                  >
                    <FileSpreadsheet size={14} /> Excel thường
                  </button>
                  <button
                    onClick={() => {
                      excelQlInputRef.current?.click();
                      setShowImportMenu(false);
                    }}
                    disabled={uploadingExcelQl}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-blue-800 disabled:opacity-50 transition-colors"
                  >
                    <FileSpreadsheet size={14} /> Excel VL
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 -mr-2 pr-2">
          {questionsLoading ? (
            <p className="text-gray-400 text-sm">Đang tải…</p>
          ) : questions.length === 0 ? (
            <p className="text-gray-400 text-sm">
              Chưa có câu hỏi. Nhập match_code rồi bấm "Tải câu hỏi".
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-blue-900">
                <tr className="text-left text-blue-300 border-b border-blue-700">
                  <th className="py-2 px-2 w-10"></th>
                  <th className="py-2 px-2">Mã câu hỏi</th>
                  <th className="py-2 px-2">Nội dung</th>
                  <th className="py-2 px-2">Đáp án</th>
                  <th className="py-2 px-2">Giải thích</th>
                  <th className="py-2 px-2">Media</th>
                </tr>
              </thead>
              <tbody>
                {questions.map((q) => (
                  <tr
                    key={q.question_code}
                    className="border-b border-blue-800/50 hover:bg-blue-800/40 transition-colors align-top"
                  >
                    <td className="py-2 px-2">
                      <button
                        onClick={() => {
                          setEditingQuestion(q);
                          setEditQContent(q.content);
                          setEditQAnswer(q.answer);
                          setEditQExplanation(q.explanation ?? "");
                          setEditQMediaUrl(q.media_url ?? "");
                        }}
                        className="p-1 rounded hover:bg-blue-700 transition-colors"
                        title="Sửa câu hỏi"
                      >
                        <Pencil size={14} />
                      </button>
                    </td>
                    <td className="py-2 px-2 font-mono text-xs whitespace-nowrap">
                      {q.question_code}
                    </td>
                    <td className="py-2 px-2 max-w-xs truncate">{q.content}</td>
                    <td className="py-2 px-2 font-semibold">{q.answer}</td>
                    <td className="py-2 px-2 text-gray-300 max-w-xs truncate">
                      {q.explanation ?? "—"}
                    </td>
                    <td className="py-2 px-2 text-xs">
                      {q.media_url ? (
                        <span
                          className="inline-flex items-center gap-1 text-blue-400"
                          title={q.media_url}
                        >
                          <Paperclip size={14} />{" "}
                          <span className="text-gray-400">✓</span>
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

    </div>
  );
};

export default AdminGameManagingPage;

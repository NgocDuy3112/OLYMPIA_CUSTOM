import { useCallback, useEffect, useState } from "react";
import { API_BASE_URL } from "@/configs";
import { createLogger } from "@/utils/logger";
import {
  getMatchCode as readStoredMatchCode,
  setMatchCode as persistMatchCode,
} from "@/utils/storage";
import { MatchManagerCard } from "@/components/admin/MatchManagerCard";
import { QuestionsCard } from "@/components/admin/QuestionsCard";
import { EditMatchQuestionPanel, type MatchQuestionEditValue } from "@/components/admin/EditMatchQuestionPanel";
import type { MatchData, QuestionData } from "@/components/admin/gameTypes";

const logger = createLogger("AdminGameManaging");

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
  const [editingQuestion, setEditingQuestion] = useState<QuestionData | null>(
    null,
  );
  const [savingQuestionEdit, setSavingQuestionEdit] = useState(false);
  const [uploadingExcel, setUploadingExcel] = useState(false);
  const [uploadingExcelQl, setUploadingExcelQl] = useState(false);

  const authHeaders = useCallback(
    (): HeadersInit => ({
      "Content-Type": "application/json",
    }),
    [],
  );

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

  const patchQuestion = useCallback(
    async (
      value: MatchQuestionEditValue,
      mediaFile: File | null,
    ) => {
      if (!editingQuestion) return;
      const code = questionsMatchCode || matchCode;
      setSavingQuestionEdit(true);
      try {
        let mediaUrl = value.mediaUrl.trim() || null;

        if (mediaFile) {
          const ext = mediaFile.name.split(".").pop() || "png";
          const s3Key = `${code}/${editingQuestion.question_code}.${ext}`;

          const formData = new FormData();
          formData.append("file", mediaFile);

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
          content: value.content.trim() || null,
          answer: value.answer.trim() || null,
          explanation: value.explanation.trim() || null,
          media_url: mediaUrl,
        };
        const res = await fetch(
          `${API_BASE_URL}/questions/${encodeURIComponent(code)}/${encodeURIComponent(editingQuestion.question_code)}`,
          { method: "PATCH", headers: authHeaders(), body: JSON.stringify(body) },
        );
        const json: ApiResponse = await res.json();
        if (json.status === "success") {
          setEditingQuestion(null);
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
    },
    [authHeaders, editingQuestion, questionsMatchCode, matchCode, fetchQuestions],
  );

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
  const handleMatchCodeChange = useCallback((value: string) => {
    setMatchCode(value);
    setQuestionsMatchCode(value);
    setMatchExists(false);
    persistMatchCode(value);
  }, []);

  const handleQuestionsMatchCodeChange = useCallback((value: string) => {
    setQuestionsMatchCode(value);
  }, []);

  const handleSelectMatch = useCallback(
    (code: string) => {
      setMatchCode(code);
      setQuestionsMatchCode(code);
      persistMatchCode(code);
      setMatchExists(false);
      void lookupMatchByCode(code);
    },
    [lookupMatchByCode],
  );

  const handleEditQuestion = useCallback((q: QuestionData) => {
    setEditingQuestion(q);
  }, []);

  const finishMatch = useCallback(
    async (m: MatchData) => {
      if (
        !confirm(
          `Xác nhận hoàn thành trận đấu "${m.match_name}" (${m.match_code})? Hành động này không thể hoàn tác.`,
        )
      )
        return;
      try {
        const res = await fetch(
          `${API_BASE_URL}/matches/${encodeURIComponent(m.match_code)}/finish`,
          { method: "PATCH", headers: authHeaders() },
        );
        const json = await res.json();
        if (json.status === "success") {
          alert("✅ Đã hoàn thành trận đấu!");
          await fetchAllMatches();
        } else {
          alert(`Lỗi: ${json.message ?? json.detail ?? "Không thể hoàn thành"}`);
        }
      } catch (err) {
        logger.error("Error finishing match:", err);
        alert("Lỗi kết nối khi hoàn thành trận đấu");
      }
    },
    [authHeaders, fetchAllMatches],
  );

  const deleteMatch = useCallback(
    async (m: MatchData) => {
      if (
        !confirm(
          `Xác nhận xoá trận đấu "${m.match_name}" (${m.match_code})?\nHành động này không thể hoàn tác.`,
        )
      )
        return;
      try {
        const res = await fetch(
          `${API_BASE_URL}/matches/${encodeURIComponent(m.match_code)}`,
          { method: "DELETE", headers: authHeaders() },
        );
        const json = await res.json();
        if (json.status === "success") {
          alert("✅ Đã xoá trận đấu!");
          await fetchAllMatches();
        } else {
          alert(`Lỗi: ${json.message ?? json.detail ?? "Không thể xoá trận đấu"}`);
        }
      } catch (err) {
        logger.error("Error deleting match:", err);
        alert("Lỗi kết nối khi xoá trận đấu");
      }
    },
    [authHeaders, fetchAllMatches],
  );
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 grid-rows-[auto_1fr] lg:grid-rows-[1fr_2fr] gap-3 sm:gap-4 p-3 sm:p-4 lg:p-6 min-h-screen lg:h-screen text-white overflow-auto lg:overflow-hidden">
      <EditMatchQuestionPanel
        item={editingQuestion}
        matchCode={questionsMatchCode || matchCode}
        saving={savingQuestionEdit}
        onClose={() => setEditingQuestion(null)}
        onSave={patchQuestion}
      />

      <MatchManagerCard
        matchCode={matchCode}
        matchName={matchName}
        userCodes={userCodes}
        userInputs={userInputs}
        matchExists={matchExists}
        matchLoading={matchLoading}
        allMatches={allMatches}
        allMatchesLoading={allMatchesLoading}
        onMatchCodeChange={handleMatchCodeChange}
        onMatchNameChange={setMatchName}
        onUserInputChange={handleUserInputChange}
        onSaveMatch={() => void createMatch()}
        onRefreshMatches={() => void fetchAllMatches()}
        onSelectMatch={handleSelectMatch}
        onFinishMatch={finishMatch}
        onDeleteMatch={deleteMatch}
      />

      <QuestionsCard
        matchCode={matchCode}
        questionsMatchCode={questionsMatchCode}
        questions={questions}
        questionsLoading={questionsLoading}
        uploadingExcel={uploadingExcel}
        uploadingExcelQl={uploadingExcelQl}
        onQuestionsMatchCodeChange={handleQuestionsMatchCodeChange}
        onFetch={() => void fetchQuestions()}
        onUploadExcel={(file, isQualifier) => void uploadExcel(file, isQualifier)}
        onEditQuestion={handleEditQuestion}
      />

    </div>
  );
};

export default AdminGameManagingPage;

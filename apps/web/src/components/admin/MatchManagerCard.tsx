import { useNavigate } from "react-router-dom";
import { Plus, RefreshCw, Gamepad2, Trash2 } from "lucide-react";
import {
  getMatchCode as readStoredMatchCode,
  setMatchCode as persistMatchCode,
} from "@/utils/storage";
import type { MatchData } from "./gameTypes";

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

const inputClass =
  "px-3 py-2 rounded-lg bg-blue-950 border border-blue-700 text-white placeholder-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm";

interface MatchManagerCardProps {
  matchCode: string;
  matchName: string;
  userCodes: string[];
  userInputs: string[];
  matchExists: boolean;
  matchLoading: boolean;
  allMatches: MatchData[];
  allMatchesLoading: boolean;
  /** Page lo side-effects: setQuestionsMatchCode + persist + setMatchExists(false). */
  onMatchCodeChange: (value: string) => void;
  onMatchNameChange: (value: string) => void;
  onUserInputChange: (index: number, value: string) => void;
  onSaveMatch: () => void;
  onRefreshMatches: () => void;
  /** Chọn trận trong list — page lo lookup + sync matchCode. */
  onSelectMatch: (matchCode: string) => void;
  onFinishMatch: (m: MatchData) => void;
  onDeleteMatch: (m: MatchData) => void;
}

/** Card tạo/cập nhật trận đấu + danh sách trận — AdminGameManagingPage. */
export function MatchManagerCard({
  matchCode,
  matchName,
  userCodes,
  userInputs,
  matchExists,
  matchLoading,
  allMatches,
  allMatchesLoading,
  onMatchCodeChange,
  onMatchNameChange,
  onUserInputChange,
  onSaveMatch,
  onRefreshMatches,
  onSelectMatch,
  onFinishMatch,
  onDeleteMatch,
}: MatchManagerCardProps) {
  return (
    <div className="bg-blue-900/60 ring-4 ring-blue-600 rounded-xl p-5 flex flex-col gap-4 overflow-hidden row-span-2">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-xl font-bold text-blue-300">
          <Gamepad2 size={22} /> Tạo trận đấu & Quản lý trận đấu
        </h2>
        <button
          onClick={onRefreshMatches}
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
          onChange={(e) => onMatchCodeChange(e.target.value)}
          className={inputClass}
        />

        {}
        <input
          type="text"
          placeholder="Tên trận đấu"
          value={matchName}
          onChange={(e) => onMatchNameChange(e.target.value)}
          className={inputClass}
        />

        {}

        <div className="grid grid-cols-2 gap-2">
          {userInputs.map((input, i) => (
            <div key={i} className="relative">
              <input
                placeholder={`Tên / mã vị trí #${i + 1}`}
                value={input}
                onChange={(e) => onUserInputChange(i, e.target.value)}
                className={`w-full ${inputClass}`}
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
            onClick={onSaveMatch}
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
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-blue-300 uppercase tracking-wide">
            Danh sách trận đấu
          </h3>
          <button
            onClick={() => onMatchCodeChange(matchCode)}
            className="p-1.5 rounded bg-blue-700/70 hover:bg-blue-600 transition-colors"
            title="Chọn lại trận hiện tại"
            hidden
          >
            <RefreshCw size={13} />
          </button>
        </div>
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
                    onClick={() => onSelectMatch(m.match_code)}
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
                            onClick={() => onFinishMatch(m)}
                            className="text-xs px-3 py-1 rounded bg-green-700 hover:bg-green-500 transition-colors font-semibold"
                            title="Đánh dấu trận đấu đã hoàn thành"
                          >
                            Hoàn thành
                          </button>
                        )}
                        <button
                          onClick={() => onDeleteMatch(m)}
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
  );
}

export default MatchManagerCard;

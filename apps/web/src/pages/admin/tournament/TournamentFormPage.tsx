import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { API_BASE_URL } from "@/configs";
import { ArrowLeft, Save, Loader2 } from "lucide-react";

interface TournamentFormData {
  tournamentName: string;
  description: string;
  tournamentFormat: string;
  startDate: string;
  endDate: string;
  maxPlayers: string;
  venue: string;
  notes: string;
  status: string;
}

const INITIAL_FORM_DATA: TournamentFormData = {
  tournamentName: "",
  description: "",
  tournamentFormat: "oc3",
  startDate: "",
  endDate: "",
  maxPlayers: "",
  venue: "",
  notes: "",
  status: "draft",
};

const TOURNAMENT_FORMATS = [
  { value: "oc3", label: "Olympia Custom 3 (OC3)" },
  { value: "oc4", label: "Olympia Custom 4 (OC4)" },
];

const STATUS_OPTIONS = [
  { value: "draft", label: "Nháp" },
  { value: "active", label: "Đang diễn ra" },
  { value: "completed", label: "Hoàn thành" },
  { value: "archived", label: "Lưu trữ" },
];

const inputClass =
  "w-full px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm";

const labelClass = "block text-[11px] text-gray-500 uppercase tracking-wide mb-1";

const TournamentFormPage: React.FC = () => {
  const navigate = useNavigate();
  const { code } = useParams<{ code: string }>();
  const isEditing = !!code;

  const [formData, setFormData] =
    useState<TournamentFormData>(INITIAL_FORM_DATA);
  const [isLoading, setIsLoading] = useState(isEditing);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load tournament data if editing
  useEffect(() => {
    if (!code) return;

    const fetchTournament = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/tournaments/${code}`, {
          credentials: "include",
        });

        if (!response.ok) {
          throw new Error("Tournament not found");
        }

        const data = await response.json();
        if (data.status === "success" && data.data) {
          const tournament = data.data;
          setFormData({
            tournamentName: tournament.tournamentName || "",
            description: tournament.description || "",
            tournamentFormat: tournament.tournamentFormat || "oc3",
            startDate: tournament.startDate || "",
            endDate: tournament.endDate || "",
            maxPlayers: tournament.maxPlayers || "",
            venue: tournament.venue || "",
            notes: tournament.notes || "",
            status: tournament.status || "draft",
          });
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load tournament",
        );
      } finally {
        setIsLoading(false);
      }
    };

    fetchTournament();
  }, [code]);

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.tournamentName.trim()) {
      setError("Tên giải đấu là bắt buộc");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const url = isEditing
        ? `${API_BASE_URL}/tournaments/${code}`
        : `${API_BASE_URL}/tournaments`;

      const method = isEditing ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || "Failed to save tournament");
      }

      navigate("/admin/tournaments");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to save tournament",
      );
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-1 sm:p-2 text-white max-w-2xl">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate("/admin/tournaments")}
          className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">
            {isEditing ? "Chỉnh sửa giải đấu" : "Tạo giải đấu mới"}
          </h1>
          <p className="text-gray-400 text-sm mt-0.5">
            {isEditing
              ? "Cập nhật thông tin giải đấu"
              : "Điền thông tin để tạo giải đấu mới"}
          </p>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-300 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <section className="flex flex-col gap-3">
          <p className="text-xs font-medium text-gray-400">Cơ bản</p>
          <div>
            <label className={labelClass}>
              Tên giải đấu <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              name="tournamentName"
              value={formData.tournamentName}
              onChange={handleChange}
              placeholder="VD: Olympia Custom Season 1"
              className={inputClass}
              required
            />
          </div>
          <div>
            <label className={labelClass}>Mô tả</label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleChange}
              placeholder="Mô tả về giải đấu..."
              rows={3}
              className={`${inputClass} resize-none`}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Format giải đấu</label>
              <select
                name="tournamentFormat"
                value={formData.tournamentFormat}
                onChange={handleChange}
                className={`${inputClass} bg-black/30`}
              >
                {TOURNAMENT_FORMATS.map((fmt) => (
                  <option key={fmt.value} value={fmt.value}>
                    {fmt.label}
                  </option>
                ))}
              </select>
            </div>
            {isEditing && (
              <div>
                <label className={labelClass}>Trạng thái</label>
                <select
                  name="status"
                  value={formData.status}
                  onChange={handleChange}
                  className={`${inputClass} bg-black/30`}
                >
                  {STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <p className="text-xs font-medium text-gray-400">Thời gian & địa điểm</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Ngày bắt đầu</label>
              <input
                type="date"
                name="startDate"
                value={formData.startDate}
                onChange={handleChange}
                className={`${inputClass} text-gray-200`}
              />
            </div>
            <div>
              <label className={labelClass}>Ngày kết thúc</label>
              <input
                type="date"
                name="endDate"
                value={formData.endDate}
                onChange={handleChange}
                className={`${inputClass} text-gray-200`}
              />
            </div>
            <div>
              <label className={labelClass}>Số thí sinh tối đa</label>
              <input
                type="text"
                name="maxPlayers"
                value={formData.maxPlayers}
                onChange={handleChange}
                placeholder="VD: 16, 32"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Địa điểm</label>
              <input
                type="text"
                name="venue"
                value={formData.venue}
                onChange={handleChange}
                placeholder="VD: Trường ĐH Bách Khoa"
                className={inputClass}
              />
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <p className="text-xs font-medium text-gray-400">Ghi chú</p>
          <textarea
            name="notes"
            value={formData.notes}
            onChange={handleChange}
            placeholder="Ghi chú thêm..."
            rows={2}
            className={`${inputClass} resize-none`}
          />
        </section>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => navigate("/admin/tournaments")}
            className="px-5 py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors text-sm"
          >
            Hủy
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors disabled:opacity-50 text-sm font-medium"
          >
            {isSaving ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <Save size={15} />
            )}
            <span>{isEditing ? "Cập nhật" : "Tạo giải đấu"}</span>
          </button>
        </div>
      </form>
    </div>
  );
};

export default TournamentFormPage;

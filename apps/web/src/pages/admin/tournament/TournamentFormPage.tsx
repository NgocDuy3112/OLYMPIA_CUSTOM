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
  { value: "ochcmc", label: "OHCMC" },
];

const STATUS_OPTIONS = [
  { value: "draft", label: "Nháp" },
  { value: "active", label: "Đang diễn ra" },
  { value: "completed", label: "Hoàn thành" },
  { value: "archived", label: "Lưu trữ" },
];

const TournamentFormPage: React.FC = () => {
  const navigate = useNavigate();
  const { code } = useParams<{ code: string }>();
  const isEditing = !!code;

  const [formData, setFormData] = useState<TournamentFormData>(INITIAL_FORM_DATA);
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
        setError(err instanceof Error ? err.message : "Failed to load tournament");
      } finally {
        setIsLoading(false);
      }
    };

    fetchTournament();
  }, [code]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
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
      setError(err instanceof Error ? err.message : "Failed to save tournament");
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
    <div className="p-4 sm:p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate("/admin/tournaments")}
          className="p-2 hover:bg-white/10 rounded-lg transition-colors"
        >
          <ArrowLeft size={20} className="text-white" />
        </button>
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white">
            {isEditing ? "Chỉnh sửa giải đấu" : "Tạo giải đấu mới"}
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            {isEditing ? "Cập nhật thông tin giải đấu" : "Điền thông tin để tạo giải đấu mới"}
          </p>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="mb-4 p-3 bg-red-500/20 border border-red-500 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="card !p-6 space-y-6">
        {/* Tournament Name */}
        <div>
          <label className="block text-sm font-medium text-white mb-2">
            Tên giải đấu <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            name="tournamentName"
            value={formData.tournamentName}
            onChange={handleChange}
            placeholder="VD: Olympia Custom Season 1"
            className="w-full px-4 py-2.5 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 touch-target"
            required
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-white mb-2">
            Mô tả
          </label>
          <textarea
            name="description"
            value={formData.description}
            onChange={handleChange}
            placeholder="Mô tả về giải đấu..."
            rows={3}
            className="w-full px-4 py-2.5 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 resize-none"
          />
        </div>

        {/* Tournament Format */}
        <div>
          <label className="block text-sm font-medium text-white mb-2">
            Format giải đấu
          </label>
          <select
            name="tournamentFormat"
            value={formData.tournamentFormat}
            onChange={handleChange}
            className="w-full px-4 py-2.5 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:border-blue-500 touch-target"
          >
            {TOURNAMENT_FORMATS.map((fmt) => (
              <option key={fmt.value} value={fmt.value} className="bg-gray-800">
                {fmt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Status (only when editing) */}
        {isEditing && (
          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Trạng thái
            </label>
            <select
              name="status"
              value={formData.status}
              onChange={handleChange}
              className="w-full px-4 py-2.5 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:border-blue-500 touch-target"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value} className="bg-gray-800">
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Date range */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Ngày bắt đầu
            </label>
            <input
              type="date"
              name="startDate"
              value={formData.startDate}
              onChange={handleChange}
              className="w-full px-4 py-2.5 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:border-blue-500 touch-target"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Ngày kết thúc
            </label>
            <input
              type="date"
              name="endDate"
              value={formData.endDate}
              onChange={handleChange}
              className="w-full px-4 py-2.5 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:border-blue-500 touch-target"
            />
          </div>
        </div>

        {/* Max players & Venue */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Số thí sinh tối đa
            </label>
            <input
              type="text"
              name="maxPlayers"
              value={formData.maxPlayers}
              onChange={handleChange}
              placeholder="VD: 16, 32"
              className="w-full px-4 py-2.5 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 touch-target"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Địa điểm
            </label>
            <input
              type="text"
              name="venue"
              value={formData.venue}
              onChange={handleChange}
              placeholder="VD: Trường ĐH Bách Khoa"
              className="w-full px-4 py-2.5 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 touch-target"
            />
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-white mb-2">
            Ghi chú
          </label>
          <textarea
            name="notes"
            value={formData.notes}
            onChange={handleChange}
            placeholder="Ghi chú thêm..."
            rows={2}
            className="w-full px-4 py-2.5 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 resize-none"
          />
        </div>

        {/* Submit button */}
        <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
          <button
            type="button"
            onClick={() => navigate("/admin/tournaments")}
            className="px-6 py-2.5 bg-gray-600 hover:bg-gray-500 text-white rounded-lg transition-colors touch-target"
          >
            Hủy
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors disabled:opacity-50 touch-target"
          >
            {isSaving ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <Save size={18} />
            )}
            <span>{isEditing ? "Cập nhật" : "Tạo giải đấu"}</span>
          </button>
        </div>
      </form>
    </div>
  );
};

export default TournamentFormPage;

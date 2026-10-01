import { useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { SidePanel } from "@/components/shared/ui/SidePanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import {
  emptyTournamentForm,
  type TournamentFormValue,
} from "./scheduleFormState";

export type { TournamentFormValue } from "./scheduleFormState";

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
  "w-full px-3 py-2 rounded-lg bg-blue-900 border border-blue-700 text-white placeholder-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm";
const labelClass = "block text-[11px] text-blue-300 uppercase tracking-wide mb-1";

interface TournamentFormPanelProps {
  open: boolean;
  /** null = tạo mới; có giá trị = sửa. */
  initial: Partial<TournamentFormValue> | null;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (v: TournamentFormValue) => void | Promise<void>;
}

/** Panel tạo/sửa giải đấu (sidebar phải) — dùng cho list + detail. */
export function TournamentFormPanel({
  open,
  initial,
  saving,
  error,
  onClose,
  onSubmit,
}: TournamentFormPanelProps) {
  const isEdit = initial !== null;
  const [form, setForm] = useState<TournamentFormValue>(emptyTournamentForm());

  useEffect(() => {
    if (!open) return;
    setForm({ ...emptyTournamentForm(), ...initial });
  }, [open, initial]);

  const set = (patch: Partial<TournamentFormValue>) =>
    setForm((f) => ({ ...f, ...patch }));

  return (
    <SidePanel
      open={open}
      onClose={onClose}
      title={isEdit ? "Chỉnh sửa giải đấu" : "Tạo giải đấu mới"}
      wide
      footer={
        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            onClick={onClose}
            className="px-5 py-2 rounded-lg bg-blue-800 hover:bg-blue-700 transition-colors text-sm"
          >
            Hủy
          </Button>
          <Button
            variant="default"
            onClick={() => void onSubmit(form)}
            disabled={saving || !form.tournamentName.trim()}
            className="gap-2 px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 transition-colors disabled:opacity-50 text-sm font-medium"
          >
            {saving ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <Save size={15} />
            )}
            <span>{isEdit ? "Cập nhật" : "Tạo giải đấu"}</span>
          </Button>
        </div>
      }
    >
      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-300 text-sm">
          {error}
        </div>
      )}
      <section className="flex flex-col gap-3">
        <p className="text-xs font-medium text-gray-400">Cơ bản</p>
        <div>
          <label className={labelClass}>
            Tên giải đấu <span className="text-red-400">*</span>
          </label>
          <Input
            type="text"
            value={form.tournamentName}
            onChange={(e) => set({ tournamentName: e.target.value })}
            placeholder="VD: Olympia Custom Season 1"
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Mô tả</label>
          <Textarea
            value={form.description}
            onChange={(e) => set({ description: e.target.value })}
            placeholder="Mô tả về giải đấu..."
            rows={3}
            className={`${inputClass} resize-none`}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Format giải đấu</label>
            <NativeSelect
              value={form.tournamentFormat}
              onChange={(e) => set({ tournamentFormat: e.target.value })}
              className="w-full"
            >
              {TOURNAMENT_FORMATS.map((fmt) => (
                <option key={fmt.value} value={fmt.value}>
                  {fmt.label}
                </option>
              ))}
            </NativeSelect>
          </div>
          {isEdit && (
            <div>
              <label className={labelClass}>Trạng thái</label>
              <NativeSelect
                value={form.status}
                onChange={(e) => set({ status: e.target.value })}
                className="w-full"
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </NativeSelect>
            </div>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <p className="text-xs font-medium text-gray-400">Thời gian & địa điểm</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Ngày bắt đầu</label>
            <Input
              type="date"
              value={form.startDate}
              onChange={(e) => set({ startDate: e.target.value })}
              className={`${inputClass} text-gray-200`}
            />
          </div>
          <div>
            <label className={labelClass}>Ngày kết thúc</label>
            <Input
              type="date"
              value={form.endDate}
              onChange={(e) => set({ endDate: e.target.value })}
              className={`${inputClass} text-gray-200`}
            />
          </div>
          <div>
            <label className={labelClass}>Số thí sinh tối đa</label>
            <Input
              type="text"
              value={form.maxPlayers}
              onChange={(e) => set({ maxPlayers: e.target.value })}
              placeholder="VD: 16, 32"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Địa điểm</label>
            <Input
              type="text"
              value={form.venue}
              onChange={(e) => set({ venue: e.target.value })}
              placeholder="VD: Trường ĐH Bách Khoa"
              className={inputClass}
            />
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <p className="text-xs font-medium text-gray-400">Ghi chú</p>
        <Textarea
          value={form.notes}
          onChange={(e) => set({ notes: e.target.value })}
          placeholder="Ghi chú thêm..."
          rows={2}
          className={`${inputClass} resize-none`}
        />
      </section>
    </SidePanel>
  );
}

export default TournamentFormPanel;

import { useEffect, useState } from "react";
import type { ScheduleFormValue } from "./scheduleFormState";

const inputClass =
  "px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm w-full";

interface MatchScheduleFormProps {
  initial: ScheduleFormValue;
  isEdit: boolean;
  saving: boolean;
  tournaments: { tournamentCode: string; tournamentName: string }[];
  /** Khi có danh sách vòng (VD: tab phân nhánh) thì hiện select gán trận vào vòng. */
  phases?: { id: string; phaseName: string }[];
  /** Render trần (dùng trong SidePanel) thay vì khung card. */
  bare?: boolean;
  onSubmit: (v: ScheduleFormValue) => void;
  onCancel: () => void;
}

/** Form lên lịch / sửa trận: giờ, địa điểm, nhãn, 4 slot thí sinh. */
export function MatchScheduleForm({
  initial,
  isEdit,
  saving,
  tournaments,
  phases,
  bare = false,
  onSubmit,
  onCancel,
}: MatchScheduleFormProps) {
  const [form, setForm] = useState<ScheduleFormValue>(initial);

  useEffect(() => {
    setForm(initial);
  }, [initial]);

  const set = (patch: Partial<ScheduleFormValue>) => setForm((f) => ({ ...f, ...patch }));
  const setPlayer = (i: number, v: string) =>
    setForm((f) => {
      const next = [...f.playerCodes];
      next[i] = v;
      return { ...f, playerCodes: next };
    });

  return (
    <div className={bare ? "flex flex-col gap-3" : "rounded-xl bg-blue-600/[0.07] border border-blue-500/30 p-4 flex flex-col gap-3"}>
      {!bare && (
        <p className="text-sm font-semibold text-gray-200">
          {isEdit ? "Sửa trận / lịch" : "Lên lịch trận mới"}
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <input
          placeholder="Tên trận đấu *"
          value={form.matchName}
          onChange={(e) => set({ matchName: e.target.value })}
          className={`${inputClass} sm:col-span-2`}
        />
        <select
          value={form.tournamentCode}
          onChange={(e) => set({ tournamentCode: e.target.value })}
          className={`${inputClass} bg-black/30`}
        >
          <option value="">Không thuộc giải nào</option>
          {tournaments.map((t) => (
            <option key={t.tournamentCode} value={t.tournamentCode}>
              {t.tournamentName} ({t.tournamentCode})
            </option>
          ))}
        </select>
        <input
          placeholder="Nhãn (VD: BK1, CK…)"
          value={form.matchLabel}
          onChange={(e) => set({ matchLabel: e.target.value.toUpperCase() })}
          className={`${inputClass} font-mono`}
          maxLength={20}
        />
        {phases && phases.length > 0 && (
          <select
            value={form.phaseId}
            onChange={(e) => set({ phaseId: e.target.value })}
            className={`${inputClass} bg-black/30 sm:col-span-2`}
          >
            <option value="">Không gán vòng nào</option>
            {phases.map((p) => (
              <option key={p.id} value={p.id}>
                {p.phaseName}
              </option>
            ))}
          </select>
        )}
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-gray-500 uppercase tracking-wide">Giờ thi đấu</span>
          <input
            type="datetime-local"
            value={form.scheduledAt}
            onChange={(e) => set({ scheduledAt: e.target.value })}
            className={`${inputClass} text-gray-200`}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-gray-500 uppercase tracking-wide">Địa điểm</span>
          <input
            placeholder="Hội trường A…"
            value={form.venue}
            onChange={(e) => set({ venue: e.target.value })}
            className={inputClass}
            maxLength={200}
          />
        </label>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {form.playerCodes.map((code, i) => (
          <label key={i} className="relative block">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] font-mono text-gray-500 pointer-events-none">
              #{i + 1}
            </span>
            <input
              placeholder="userCode"
              value={code}
              onChange={(e) => setPlayer(i, e.target.value)}
              className={`${inputClass} pl-8 font-mono text-xs`}
            />
          </label>
        ))}
      </div>

      <div className="flex gap-2 justify-end">
        <button
          onClick={onCancel}
          className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-sm transition-colors"
        >
          Huỷ
        </button>
        <button
          onClick={() => onSubmit(form)}
          disabled={saving || !form.matchName.trim()}
          className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 font-semibold text-sm transition-colors"
        >
          {saving ? "Đang lưu…" : isEdit ? "Lưu thay đổi" : "Lên lịch"}
        </button>
      </div>
    </div>
  );
}

export default MatchScheduleForm;

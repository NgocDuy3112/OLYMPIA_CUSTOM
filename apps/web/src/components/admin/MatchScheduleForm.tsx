import { useEffect, useState } from "react";
import type { ScheduleFormValue } from "./scheduleFormState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { FormField, formInputClass } from "@/components/shared/ui/form";

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
    <div className={bare ? "flex flex-col gap-3" : "rounded-xl bg-primary/[0.07] border border-primary/30 p-4 flex flex-col gap-3"}>
      {!bare && (
        <p className="text-sm font-semibold text-foreground">
          {isEdit ? "Sửa trận / lịch" : "Lên lịch trận mới"}
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField label="Tên trận đấu" required className="sm:col-span-2">
          <Input
            placeholder="VD: Chung kết…"
            value={form.matchName}
            onChange={(e) => set({ matchName: e.target.value })}
            className={formInputClass}
          />
        </FormField>
        <FormField label="Giải đấu">
          <NativeSelect
            value={form.tournamentCode}
            onChange={(e) => set({ tournamentCode: e.target.value })}
            className={formInputClass}
          >
            <option value="">Không thuộc giải nào</option>
            {tournaments.map((t) => (
              <option key={t.tournamentCode} value={t.tournamentCode}>
                {t.tournamentName} ({t.tournamentCode})
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField label="Nhãn" hint="VD: BK1, CK…">
          <Input
            value={form.matchLabel}
            onChange={(e) => set({ matchLabel: e.target.value.toUpperCase() })}
            className={`${formInputClass} font-mono`}
            maxLength={20}
          />
        </FormField>
        {phases && phases.length > 0 && (
          <FormField label="Vòng" className="sm:col-span-2">
            <NativeSelect
              value={form.phaseId}
              onChange={(e) => set({ phaseId: e.target.value })}
              className={formInputClass}
            >
              <option value="">Không gán vòng nào</option>
              {phases.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.phaseName}
                </option>
              ))}
            </NativeSelect>
          </FormField>
        )}
        <FormField label="Giờ thi đấu">
          <Input
            type="datetime-local"
            value={form.scheduledAt}
            onChange={(e) => set({ scheduledAt: e.target.value })}
            className={`${formInputClass} text-foreground`}
          />
        </FormField>
        <FormField label="Địa điểm">
          <Input
            placeholder="Hội trường A…"
            value={form.venue}
            onChange={(e) => set({ venue: e.target.value })}
            className={formInputClass}
            maxLength={200}
          />
        </FormField>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {form.playerCodes.map((code, i) => (
          <label key={i} className="relative block">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] font-mono text-muted-foreground pointer-events-none">
              #{i + 1}
            </span>
            <Input
              placeholder="userCode"
              value={code}
              onChange={(e) => setPlayer(i, e.target.value)}
              className={`${formInputClass} pl-8 font-mono text-xs`}
            />
          </label>
        ))}
      </div>

      <div className="flex gap-2 justify-end sticky bottom-0 bg-popover py-2 border-t border-border">
        <Button
          variant="ghost"
          onClick={onCancel}
          className="px-4 py-2 rounded-lg bg-accent/50 border border-border hover:bg-accent text-sm transition-colors"
        >
          Huỷ
        </Button>
        <Button
          variant="default"
          onClick={() => onSubmit(form)}
          disabled={saving || !form.matchName.trim()}
          className="px-4 py-2 rounded-lg bg-primary hover:bg-primary/90 disabled:opacity-50 font-semibold text-sm transition-colors"
        >
          {saving ? "Đang lưu…" : isEdit ? "Lưu thay đổi" : "Lên lịch"}
        </Button>
      </div>
    </div>
  );
}

export default MatchScheduleForm;

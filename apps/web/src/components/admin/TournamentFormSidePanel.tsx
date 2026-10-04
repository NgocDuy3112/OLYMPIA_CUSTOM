import { useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { SidePanel } from "@/components/shared/ui/SidePanel";
import {
  FormField,
  FormSection,
  formInputClass,
} from "@/components/shared/ui/form";
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

interface TournamentFormPanelProps {
  open: boolean;
  initial: Partial<TournamentFormValue> | null;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (v: TournamentFormValue) => void | Promise<void>;
}

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
            className="px-5 py-2 rounded-lg bg-accent/50 hover:bg-accent transition-colors text-sm"
          >
            Hủy
          </Button>
          <Button
            variant="default"
            onClick={() => void onSubmit(form)}
            disabled={saving || !form.tournamentName.trim()}
            className="gap-2 px-5 py-2 rounded-lg transition-colors disabled:opacity-50 text-sm font-medium"
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
        <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-xl text-destructive text-sm">
          {error}
        </div>
      )}
      <section className="flex flex-col gap-4">
        <FormSection>Cơ bản</FormSection>
        <FormField label="Tên giải đấu" required>
          <Input
            type="text"
            value={form.tournamentName}
            onChange={(e) => set({ tournamentName: e.target.value })}
            placeholder="VD: Olympia Custom Season 1"
            className={formInputClass}
          />
        </FormField>
        <FormField label="Mô tả">
          <Textarea
            value={form.description}
            onChange={(e) => set({ description: e.target.value })}
            placeholder="Mô tả về giải đấu..."
            rows={3}
            className="resize-none"
          />
        </FormField>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="Format giải đấu">
            <NativeSelect
              value={form.tournamentFormat}
              onChange={(e) => set({ tournamentFormat: e.target.value })}
              className={formInputClass}
            >
              {TOURNAMENT_FORMATS.map((fmt) => (
                <option key={fmt.value} value={fmt.value}>
                  {fmt.label}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          {isEdit && (
            <FormField label="Trạng thái">
              <NativeSelect
                value={form.status}
                onChange={(e) => set({ status: e.target.value })}
                className={formInputClass}
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <FormSection>Thời gian &amp; địa điểm</FormSection>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="Ngày bắt đầu">
            <Input
              type="date"
              value={form.startDate}
              onChange={(e) => set({ startDate: e.target.value })}
              className={`${formInputClass} text-foreground`}
            />
          </FormField>
          <FormField label="Ngày kết thúc">
            <Input
              type="date"
              value={form.endDate}
              onChange={(e) => set({ endDate: e.target.value })}
              className={`${formInputClass} text-foreground`}
            />
          </FormField>
          <FormField label="Số thí sinh tối đa">
            <Input
              type="text"
              value={form.maxPlayers}
              onChange={(e) => set({ maxPlayers: e.target.value })}
              placeholder="VD: 16, 32"
              className={formInputClass}
            />
          </FormField>
          <FormField label="Địa điểm">
            <Input
              type="text"
              value={form.venue}
              onChange={(e) => set({ venue: e.target.value })}
              placeholder="VD: Trường ĐH Bách Khoa"
              className={formInputClass}
            />
          </FormField>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <FormSection>Ghi chú</FormSection>
        <FormField label="Ghi chú">
          <Textarea
            value={form.notes}
            onChange={(e) => set({ notes: e.target.value })}
            placeholder="Ghi chú thêm..."
            rows={2}
            className="resize-none"
          />
        </FormField>
      </section>
    </SidePanel>
  );
}

export default TournamentFormPanel;

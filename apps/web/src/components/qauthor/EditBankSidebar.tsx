import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { Search } from "lucide-react";
import { SidePanel } from "@/components/shared/ui/SidePanel";
import { RenderMedia } from "@/components/shared/RenderMedia";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { API_BASE_URL } from "@/configs";
import type { BankData } from "./bankTypes";

/** Nhóm form soạn theo vòng: KĐ chung form, GM theo set, VĐ theo domain/độ khó. */
export type BankFormKind = "kd" | "bp" | "vd" | "gm-key" | "gm-hint";

export const VD_DOMAINS = ["THTH", "TNSS", "XHPL", "VHNT", "TTGT", "KTTH"] as const;
export const VD_LEVELS = [20, 30, 40, 50] as const;
export const GM_HINTS = ["H1", "H2", "H3", "H4", "H5", "H6", "H7", "H8"] as const;

/** Giá trị sidebar bank trả về khi lưu (mã bank tự sinh lúc lưu). */
export interface BankFormValue {
  content: string;
  answer: string;
  explanation: string;
  roundHint: string;
  domain: string;
  difficulty: string;
  setCode: string;
  hintIndex: string;
  citationUrl: string;
  mediaFile: File | null;
  /** True = xóa media hiện có. */
  removeMedia: boolean;
}

interface EditBankSidebarProps {
  open: boolean;
  mode: "create" | "edit";
  kind: BankFormKind;
  /** Giá trị fix sẵn theo tab (roundHint/domain/setCode...). */
  preset?: Partial<BankFormValue>;
  initial: BankData | null;
  saving: boolean;
  onClose: () => void;
  onSave: (value: BankFormValue) => void | Promise<void>;
}

const EMPTY: BankFormValue = {
  content: "",
  answer: "",
  explanation: "",
  roundHint: "",
  domain: "",
  difficulty: "",
  setCode: "",
  hintIndex: "",
  citationUrl: "",
  mediaFile: null,
  removeMedia: false,
};

const KIND_TITLE: Record<BankFormKind, string> = {
  kd: "Khởi động",
  bp: "Bứt phá",
  vd: "Về đích",
  "gm-key": "GM — từ khóa",
  "gm-hint": "GM — gợi ý",
};
/** Stamp VN hiện tại — chuyển sang bankTypes.ts (tránh lỗi react-refresh). */

/** Preview file local chưa upload: ảnh hiện ảnh, video hiện video, audio hiện audio. */
function LocalPreview({ file }: { file: File }) {
  const url = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  if (file.type.startsWith("image/")) {
    return <img src={url} alt="Preview" className="max-h-48 rounded object-contain" />;
  }
  if (file.type.startsWith("video/")) {
    return <video src={url} controls className="max-h-48 w-full rounded" />;
  }
  return <audio src={url} controls className="w-full" />;
}

/** Sidebar soạn + sửa câu bank (QAuthor): content/answer bắt buộc, media preview inline. */
export function EditBankSidebar({ open, mode, kind, preset, initial, saving, onClose, onSave }: EditBankSidebarProps) {
  const [value, setValue] = useState<BankFormValue>(EMPTY);
  const [dupNote, setDupNote] = useState("");
  const [checkingDup, setCheckingDup] = useState(false);

  const defaultRound = (kind === "gm-key" || kind === "gm-hint") ? "GM"
    : kind === "vd" ? "VD"
    : kind === "bp" ? "BP"
    : (preset?.roundHint || "KD_C");

  useEffect(() => {
    if (!open) return;
    setDupNote("");
    if (mode === "edit" && initial) {
      const c0 = initial.citations?.[0];
      setValue({
        ...EMPTY,
        content: initial.content,
        answer: initial.answer,
        explanation: initial.explanation ?? "",
        roundHint: initial.round_hint ?? "",
        domain: initial.domain ?? "",
        difficulty: initial.difficulty != null ? String(initial.difficulty) : "",
        setCode: initial.set_code ?? "",
        hintIndex: initial.hint_index ?? "",
        citationUrl: c0?.url ?? "",
      });
    } else if (kind === "gm-key") {
      setValue({ ...EMPTY, roundHint: "GM", setCode: "", hintIndex: "KEY" });
    } else {
      setValue({
        ...EMPTY,
        roundHint: preset?.roundHint ?? defaultRound,
        domain: preset?.domain ?? "",
        difficulty: preset?.difficulty ?? "",
        setCode: preset?.setCode ?? "",
        hintIndex: preset?.hintIndex ?? "",
      });
    }
  }, // eslint-disable-next-line react-hooks/exhaustive-deps
  [open, mode, kind, initial]);

  const set =
    (key: keyof BankFormValue) =>
    (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setValue((prev) => ({ ...prev, [key]: e.target.value }));

  const pickFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/") && !file.type.startsWith("audio/") && !file.type.startsWith("video/")) {
      alert("Chỉ nhận ảnh/audio/video.");
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      alert("File tối đa 50MB.");
      return;
    }
    setValue((prev) => ({ ...prev, mediaFile: file, removeMedia: false }));
    e.target.value = "";
  };

  const checkDuplicate = async () => {
    const q = value.content.trim().slice(0, 40);
    if (!q) {
      setDupNote("Nhập nội dung trước khi check trùng.");
      return;
    }
    setCheckingDup(true);
    setDupNote("");
    try {
      const params = new URLSearchParams({ q, limit: "5" });
      const res = await fetch(`${API_BASE_URL}/bank/search?${params.toString()}`, {
        credentials: "include",
      });
      const json = await res.json();
      const total = json?.data?.total ?? 0;
      setDupNote(
        total > 0
          ? `Tìm thấy ${total} câu tương tự — kiểm tra trước khi lưu.`
          : "Không thấy câu tương tự.",
      );
    } catch {
      setDupNote("Lỗi kết nối khi check trùng.");
    } finally {
      setCheckingDup(false);
    }
  };

  const inputClass =
    "px-3 py-2 rounded-lg bg-background/60 border border-border text-foreground text-sm";
  const labelClass = "text-xs text-brand";

  return (
    <SidePanel
      open={open}
      onClose={onClose}
      wide
      title={mode === "create" ? `Tạo câu ${KIND_TITLE[kind]}` : `Sửa ${initial?.bank_code ?? ""}`}
      footer={
        <div className="flex gap-2 justify-end">
          <Button
            variant="ghost"
            onClick={() => void checkDuplicate()}
            disabled={checkingDup || saving}
            className="gap-1 bg-accent/50 hover:bg-accent disabled:opacity-50 text-sm"
          >
            <Search size={14} /> {checkingDup ? "Đang check…" : "Check trùng"}
          </Button>
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={saving}
            className="bg-accent/50 hover:bg-accent disabled:opacity-50 text-sm"
          >
            Huỷ
          </Button>
          <Button
            variant="default"
            onClick={() => void onSave(value)}
            disabled={saving}
            className="bg-primary hover:bg-primary/90 text-primary-foreground disabled:opacity-50 font-semibold text-sm"
          >
            {saving ? "Đang lưu…" : mode === "create" ? "Tạo câu" : "Lưu"}
          </Button>
        </div>
      }
    >
      {mode === "create" && (
        <p className="text-xs text-muted-foreground font-mono">Mã bank tự sinh lúc lưu (QB_VÒNG_HHMMSS_DDMMYYYY).</p>
      )}
      <label className={labelClass}>Nội dung *</label>
      <Textarea
        rows={4}
        value={value.content}
        onChange={set("content")}
        className={`${inputClass} resize-none`}
      />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <label className={labelClass}>Đáp án *</label>
          <Input value={value.answer} onChange={set("answer")} className={inputClass} />
        </div>
        <div className="flex flex-col gap-1">
          <label className={labelClass}>Round</label>
          {kind === "kd" && mode === "create" ? (
            <NativeSelect
              value={value.roundHint}
              onChange={(e) => setValue((prev) => ({ ...prev, roundHint: e.target.value }))}
              className="w-full font-mono"
            >
              <option value="KD_C">KĐ chung</option>
              <option value="KD_R">KĐ riêng</option>
            </NativeSelect>
          ) : (
            <Input value={value.roundHint} readOnly className={`${inputClass} font-mono opacity-70`} />
          )}
        </div>
      </div>
      {kind === "vd" && (
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1">
            <label className={labelClass}>Lĩnh vực *</label>
            <NativeSelect
              value={value.domain}
              onChange={(e) => setValue((prev) => ({ ...prev, domain: e.target.value }))}
              className="w-full font-mono"
            >
              <option value="">— chọn —</option>
              {VD_DOMAINS.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </NativeSelect>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>Độ khó *</label>
            <NativeSelect
              value={value.difficulty}
              onChange={(e) => setValue((prev) => ({ ...prev, difficulty: e.target.value }))}
              className="w-full font-mono"
            >
              <option value="">— chọn —</option>
              {VD_LEVELS.map((l) => (
                <option key={l} value={String(l)}>{l}</option>
              ))}
            </NativeSelect>
          </div>
        </div>
      )}
      {(kind === "gm-key" || kind === "gm-hint") && (
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1">
            <label className={labelClass}>Set GM</label>
            <Input
              value={value.setCode}
              readOnly
              placeholder="server tự gen S1, S2, ... khi tạo KEY"
              className={`${inputClass} font-mono opacity-70`}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>Vị trí *</label>
            {kind === "gm-hint" && mode === "create" ? (
              <NativeSelect
                value={value.hintIndex}
                onChange={(e) => setValue((prev) => ({ ...prev, hintIndex: e.target.value }))}
                className="w-full font-mono"
              >
                <option value="">— chọn —</option>
                {GM_HINTS.map((h) => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </NativeSelect>
            ) : (
              <Input value={value.hintIndex} readOnly className={`${inputClass} font-mono opacity-70`} />
            )}
          </div>
        </div>
      )}
      <label className={labelClass}>Giải thích (tuỳ chọn)</label>
      <Textarea
        rows={3}
        value={value.explanation}
        onChange={set("explanation")}
        className={`${inputClass} resize-none`}
      />
      <label className={labelClass}>Link nguồn (tuỳ chọn — OCee tự đọc + check ngày sau)</label>
      <Input
        value={value.citationUrl}
        onChange={set("citationUrl")}
        placeholder="https://…"
        className={`${inputClass} font-mono`}
      />

      <details
        key={value.mediaFile || (mode === "edit" && initial?.media_url && !value.removeMedia) ? "media-open" : "media-closed"}
        open={value.mediaFile || (mode === "edit" && initial?.media_url && !value.removeMedia) ? true : undefined}
        className="rounded-lg bg-primary/10 border border-primary/30 px-3 py-2"
      >
        <summary className="text-xs text-brand cursor-pointer select-none">
          Media (tuỳ chọn — bỏ qua được, chèn sau cũng được)
        </summary>
        <div className="pt-2">
          {value.mediaFile ? (
        <div className="rounded-lg bg-primary/10 border border-primary/30 p-3 flex flex-col gap-2">
          <LocalPreview file={value.mediaFile} />
          <Button
            size="xs"
            variant="ghost"
            onClick={() => setValue((prev) => ({ ...prev, mediaFile: null }))}
            className="text-xs text-destructive hover:text-destructive/80 self-start"
          >
            Bỏ file này
          </Button>
        </div>
      ) : mode === "edit" && initial?.media_url && !value.removeMedia ? (
        <div className="rounded-lg bg-primary/10 border border-primary/30 p-3 flex flex-col gap-2">
          <div className="max-h-48 overflow-hidden rounded">
            <RenderMedia mediaUrl={initial.media_url} />
          </div>
          <Button
            size="xs"
            variant="ghost"
            onClick={() => setValue((prev) => ({ ...prev, removeMedia: true }))}
            className="text-xs text-destructive hover:text-destructive/80 self-start"
          >
            Xóa media này
          </Button>
        </div>
      ) : (
        <label className="px-4 py-3 rounded-lg bg-accent/50 hover:bg-accent text-sm text-center cursor-pointer">
          Chọn ảnh / audio / video
          <input
            type="file"
            accept="image/*,audio/*,video/*"
            className="hidden"
            onChange={pickFile}
          />
        </label>
        )}
        </div>
      </details>
      {mode === "edit" && value.removeMedia && (
        <p className="text-xs text-warning">Sẽ xóa media khi lưu.</p>
      )}

      {dupNote && <p className="text-xs text-warning">{dupNote}</p>}
    </SidePanel>
  );
}

export default EditBankSidebar;

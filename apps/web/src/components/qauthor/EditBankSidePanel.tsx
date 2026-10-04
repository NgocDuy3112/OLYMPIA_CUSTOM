import { useEffect, useState, type ChangeEvent } from "react";
import { Search } from "lucide-react";
import { SidePanel } from "@/components/shared/ui/SidePanel";
import { FormField, formInputClass } from "@/components/shared/ui/form";
import { RenderMedia } from "@/components/shared/RenderMedia";
import { MediaFilePicker } from "@/components/shared/MediaFilePicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { API_BASE_URL } from "@/configs";
import type { BankData } from "./bankTypes";
import { Progress } from "@/components/ui/progress";

export type BankFormKind = "kd" | "bp" | "vd" | "gm-key" | "gm-hint";

export const VD_DOMAINS = ["THTH", "TNSS", "XHPL", "VHNT", "TTGT", "KTTH"] as const;
export const VD_LEVELS = [20, 30, 40, 50] as const;
export const GM_HINTS = ["H1", "H2", "H3", "H4", "H5", "H6", "H7", "H8"] as const;

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
  removeMedia: boolean;
}

interface EditBankSidePanelProps {
  open: boolean;
  mode: "create" | "edit";
  kind: BankFormKind;
  preset?: Partial<BankFormValue>;
  initial: BankData | null;
  saving: boolean;
  uploadPct?: number | null;
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

function validateBankMedia(file: File) {
  if (!file.type.startsWith("image/") && !file.type.startsWith("audio/") && !file.type.startsWith("video/")) {
    return "Chỉ nhận ảnh/audio/video.";
  }
  if (file.size > 50 * 1024 * 1024) return "File tối đa 50MB.";
}

export function EditBankSidePanel({ open, mode, kind, preset, initial, saving, uploadPct, onClose, onSave }: EditBankSidePanelProps) {
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
  },
  [open, mode, kind, initial]);

  const set =
    (key: keyof BankFormValue) =>
    (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setValue((prev) => ({ ...prev, [key]: e.target.value }));

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
            className="text-primary-foreground disabled:opacity-50 font-semibold text-sm"
          >
            {saving ? "Đang lưu…" : mode === "create" ? "Tạo câu" : "Lưu"}
          </Button>
        </div>
      }
    >
      {uploadPct !== null && uploadPct !== undefined && (
        <div className="flex items-center gap-2">
          <Progress
            value={uploadPct}
            className="flex-1 **:data-[slot=progress-track]:h-2"
          />
          <span className=" text-xs whitespace-nowrap text-muted-foreground">
            Đang upload {uploadPct}%
          </span>
        </div>
      )}
      <FormField label="Nội dung" required>
        <Textarea
          rows={4}
          value={value.content}
          onChange={set("content")}
          className="resize-none"
        />
      </FormField>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormField label="Đáp án" required>
          <Input
            value={value.answer}
            onChange={set("answer")}
            className={formInputClass}
          />
        </FormField>
        <FormField label="Lượt thi">
          {kind === "kd" && mode === "create" ? (
            <NativeSelect
              value={value.roundHint}
              onChange={(e) => setValue((prev) => ({ ...prev, roundHint: e.target.value }))}
              className={`${formInputClass} w-full`}
            >
              <option value="KD_C">Chung</option>
              <option value="KD_R">Riêng</option>
            </NativeSelect>
          ) : (
            <Input
              value={value.roundHint}
              readOnly
              className={`${formInputClass}  opacity-70`}
            />
          )}
        </FormField>
      </div>
      {kind === "vd" && (
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Lĩnh vực" required>
            <NativeSelect
              value={value.domain}
              onChange={(e) => setValue((prev) => ({ ...prev, domain: e.target.value }))}
              className={`${formInputClass} w-full `}
            >
              <option value="">— chọn —</option>
              {VD_DOMAINS.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField label="Độ khó" required>
            <NativeSelect
              value={value.difficulty}
              onChange={(e) => setValue((prev) => ({ ...prev, difficulty: e.target.value }))}
              className={`${formInputClass} w-full `}
            >
              <option value="">— chọn —</option>
              {VD_LEVELS.map((l) => (
                <option key={l} value={String(l)}>{l}</option>
              ))}
            </NativeSelect>
          </FormField>
        </div>
      )}
      {(kind === "gm-key" || kind === "gm-hint") && (
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Set GM">
            <Input
              value={value.setCode}
              readOnly
              placeholder="server tự gen S1, S2, ... khi tạo KEY"
              className={`${formInputClass}  opacity-70`}
            />
          </FormField>
          <FormField label="Vị trí" required>
            {kind === "gm-hint" && mode === "create" ? (
              <NativeSelect
                value={value.hintIndex}
                onChange={(e) => setValue((prev) => ({ ...prev, hintIndex: e.target.value }))}
                className={`${formInputClass} w-full `}
              >
                <option value="">— chọn —</option>
                {GM_HINTS.map((h) => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </NativeSelect>
            ) : (
              <Input
                value={value.hintIndex}
                readOnly
                className={`${formInputClass}  opacity-70`}
              />
            )}
          </FormField>
        </div>
      )}
      <FormField label="Giải thích" hint="Tuỳ chọn">
        <Textarea
          rows={3}
          value={value.explanation}
          onChange={set("explanation")}
          className="resize-none"
        />
      </FormField>
      <FormField
        label="Link nguồn"
        hint="Tuỳ chọn — OCee tự đọc + check ngày sau"
      >
        <Input
          value={value.citationUrl}
          onChange={set("citationUrl")}
          placeholder="https://…"
          className={`${formInputClass} `}
        />
      </FormField>

      <details
        key={value.mediaFile || (mode === "edit" && initial?.media_url && !value.removeMedia) ? "media-open" : "media-closed"}
        open={value.mediaFile || (mode === "edit" && initial?.media_url && !value.removeMedia) ? true : undefined}
        className="rounded-lg bg-primary/10 border border-primary/30 px-3 py-2"
      >
        <summary className="text-xs text-brand cursor-pointer select-none">
          Media (tuỳ chọn — bỏ qua được, chèn sau cũng được)
        </summary>
        <div className="pt-2">
          {mode === "edit" && initial?.media_url && !value.removeMedia && !value.mediaFile ? (
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
        <MediaFilePicker
          value={value.mediaFile}
          onChange={(file) => setValue((prev) => ({ ...prev, mediaFile: file, removeMedia: false }))}
          onValidate={validateBankMedia}
          dropLabel="Chọn ảnh / audio / video"
        />
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

export default EditBankSidePanel;

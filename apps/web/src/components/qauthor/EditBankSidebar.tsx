import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { Search } from "lucide-react";
import { SidePanel } from "@/components/shared/ui/SidePanel";
import { RenderMedia } from "@/components/shared/RenderMedia";
import { API_BASE_URL } from "@/configs";
import type { BankData } from "./bankTypes";

/** Nhóm form soạn theo vòng: KĐ chung form, GM theo set, VĐ theo domain/độ khó. */
export type BankFormKind = "kd" | "bp" | "vd" | "gm-key" | "gm-hint";

export const VD_DOMAINS = ["THTH", "TNSS", "XHPL", "VHNT", "TTGT", "KTTH"] as const;
export const VD_LEVELS = [20, 30, 40, 50] as const;
export const GM_HINTS = ["H1", "H2", "H3", "H4", "H5", "H6", "H7", "H8"] as const;

/** Giá trị sidebar bank trả về khi lưu. */
export interface BankFormValue {
  bankCode: string;
  content: string;
  answer: string;
  explanation: string;
  roundHint: string;
  options: string;
  domain: string;
  difficulty: string;
  setCode: string;
  hintIndex: string;
  citationSource: string;
  citationUrl: string;
  citationDate: string;
  /** File media mới chọn (chưa upload), null = giữ nguyên. */
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
  bankCode: "",
  content: "",
  answer: "",
  explanation: "",
  roundHint: "",
  options: "",
  domain: "",
  difficulty: "",
  setCode: "",
  hintIndex: "",
  citationSource: "",
  citationUrl: "",
  citationDate: "",
  mediaFile: null,
  removeMedia: false,
};

/** Mã set GM tự sinh, nhóm 1 KEY + 8 hint. */
export function genSetCode(): string {
  return `SET_${Date.now().toString(36).toUpperCase()}`;
}

const KIND_TITLE: Record<BankFormKind, string> = {
  kd: "Khởi động",
  bp: "Bứt phá",
  vd: "Về đích",
  "gm-key": "GM — từ khóa",
  "gm-hint": "GM — gợi ý",
};

/** Mã bank tự sinh dạng QB_<timestamp base36>, vừa khung 20 ký tự. */
export function genBankCode(): string {
  return `QB_${Date.now().toString(36).toUpperCase()}`;
}

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

  useEffect(() => {
    if (!open) return;
    setDupNote("");
    if (mode === "edit" && initial) {
      setValue({
        ...EMPTY,
        content: initial.content,
        answer: initial.answer,
        explanation: initial.explanation ?? "",
        roundHint: initial.round_hint ?? "",
        options: initial.options ?? "",
        domain: initial.domain ?? "",
        difficulty: initial.difficulty != null ? String(initial.difficulty) : "",
        setCode: initial.set_code ?? "",
        hintIndex: initial.hint_index ?? "",
      });
    } else if (kind === "gm-key") {
      setValue({ ...EMPTY, bankCode: genBankCode(), roundHint: "GM", setCode: genSetCode(), hintIndex: "KEY" });
    } else {
      setValue({
        ...EMPTY,
        bankCode: genBankCode(),
        roundHint: preset?.roundHint ?? "",
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
    "px-3 py-2 rounded-lg bg-blue-900 border border-blue-700 text-white text-sm";
  const labelClass = "text-xs text-blue-300";

  return (
    <SidePanel
      open={open}
      onClose={onClose}
      title={mode === "create" ? `Tạo câu ${KIND_TITLE[kind]}` : `Sửa ${initial?.bank_code ?? ""}`}
    >
      {mode === "create" && (
        <>
          <label className={labelClass}>Mã bank * (tự sinh, sửa được)</label>
          <div className="flex gap-2">
            <input
              value={value.bankCode}
              onChange={(e) =>
                setValue((prev) => ({ ...prev, bankCode: e.target.value.toUpperCase() }))
              }
              placeholder="QB_*"
              className={`${inputClass} font-mono flex-1`}
            />
            <button
              onClick={() => setValue((prev) => ({ ...prev, bankCode: genBankCode() }))}
              className="px-3 py-2 rounded-lg bg-blue-800 hover:bg-blue-700 text-sm"
              title="Sinh mã mới"
            >
              ↻
            </button>
          </div>
        </>
      )}
      <label className={labelClass}>Nội dung *</label>
      <textarea
        rows={3}
        value={value.content}
        onChange={set("content")}
        className={`${inputClass} resize-none`}
      />
      <label className={labelClass}>Đáp án *</label>
      <input value={value.answer} onChange={set("answer")} className={inputClass} />
      <label className={labelClass}>Giải thích</label>
      <textarea
        rows={2}
        value={value.explanation}
        onChange={set("explanation")}
        className={`${inputClass} resize-none`}
      />
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <label className={labelClass}>Round</label>
          {kind === "kd" && mode === "create" ? (
            <select
              value={value.roundHint}
              onChange={(e) => setValue((prev) => ({ ...prev, roundHint: e.target.value }))}
              className={`${inputClass} font-mono`}
            >
              <option value="KD_C">KĐ chung</option>
              <option value="KD_R">KĐ riêng</option>
            </select>
          ) : (
            <input value={value.roundHint} readOnly className={`${inputClass} font-mono opacity-70`} />
          )}
        </div>
        <div className="flex flex-col gap-1">
          <label className={labelClass}>Ngày truy cập</label>
          <input
            value={value.citationDate}
            onChange={set("citationDate")}
            placeholder="DD/MM/YYYY"
            className={`${inputClass} font-mono`}
          />
        </div>
      </div>
      {kind === "vd" && (
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1">
            <label className={labelClass}>Lĩnh vực *</label>
            <select
              value={value.domain}
              onChange={(e) => setValue((prev) => ({ ...prev, domain: e.target.value }))}
              className={`${inputClass} font-mono`}
            >
              <option value="">— chọn —</option>
              {VD_DOMAINS.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>Độ khó *</label>
            <select
              value={value.difficulty}
              onChange={(e) => setValue((prev) => ({ ...prev, difficulty: e.target.value }))}
              className={`${inputClass} font-mono`}
            >
              <option value="">— chọn —</option>
              {VD_LEVELS.map((l) => (
                <option key={l} value={String(l)}>{l}</option>
              ))}
            </select>
          </div>
        </div>
      )}
      {(kind === "gm-key" || kind === "gm-hint") && (
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-1">
            <label className={labelClass}>Set GM</label>
            <input value={value.setCode} readOnly className={`${inputClass} font-mono opacity-70`} />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>Vị trí *</label>
            {kind === "gm-hint" && mode === "create" ? (
              <select
                value={value.hintIndex}
                onChange={(e) => setValue((prev) => ({ ...prev, hintIndex: e.target.value }))}
                className={`${inputClass} font-mono`}
              >
                <option value="">— chọn —</option>
                {GM_HINTS.map((h) => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
            ) : (
              <input value={value.hintIndex} readOnly className={`${inputClass} font-mono opacity-70`} />
            )}
          </div>
        </div>
      )}
      <label className={labelClass}>Options JSON</label>
      <input
        value={value.options}
        onChange={set("options")}
        className={`${inputClass} font-mono`}
      />
      <label className={labelClass}>Nguồn</label>
      <input
        value={value.citationSource}
        onChange={set("citationSource")}
        placeholder="VD: Cổng Vũng Tàu"
        className={inputClass}
      />
      <label className={labelClass}>Link nguồn</label>
      <input
        value={value.citationUrl}
        onChange={set("citationUrl")}
        placeholder="https://…"
        className={`${inputClass} font-mono`}
      />

      <label className={labelClass}>Media</label>
      {value.mediaFile ? (
        <div className="rounded-lg bg-blue-950 border border-blue-700 p-3 flex flex-col gap-2">
          <LocalPreview file={value.mediaFile} />
          <button
            onClick={() => setValue((prev) => ({ ...prev, mediaFile: null }))}
            className="text-xs text-red-300 hover:text-red-200 self-start"
          >
            Bỏ file này
          </button>
        </div>
      ) : mode === "edit" && initial?.media_url && !value.removeMedia ? (
        <div className="rounded-lg bg-blue-950 border border-blue-700 p-3 flex flex-col gap-2">
          <div className="max-h-48 overflow-hidden rounded">
            <RenderMedia mediaUrl={initial.media_url} />
          </div>
          <button
            onClick={() => setValue((prev) => ({ ...prev, removeMedia: true }))}
            className="text-xs text-red-300 hover:text-red-200 self-start"
          >
            Xóa media này
          </button>
        </div>
      ) : (
        <label className="px-4 py-3 rounded-lg bg-blue-800 hover:bg-blue-700 text-sm text-center cursor-pointer">
          Chọn ảnh / audio / video
          <input
            type="file"
            accept="image/*,audio/*,video/*"
            className="hidden"
            onChange={pickFile}
          />
        </label>
      )}
      {mode === "edit" && value.removeMedia && (
        <p className="text-xs text-amber-300">Sẽ xóa media khi lưu.</p>
      )}

      {dupNote && <p className="text-xs text-amber-300">{dupNote}</p>}
      <div className="flex gap-2 justify-end mt-auto">
        <button
          onClick={() => void checkDuplicate()}
          disabled={checkingDup || saving}
          className="flex items-center gap-1 px-4 py-2 rounded-lg bg-blue-800 hover:bg-blue-700 disabled:opacity-50 text-sm"
        >
          <Search size={14} /> {checkingDup ? "Đang check…" : "Check trùng"}
        </button>
        <button
          onClick={onClose}
          disabled={saving}
          className="px-4 py-2 rounded-lg bg-blue-800 hover:bg-blue-700 disabled:opacity-50 text-sm"
        >
          Huỷ
        </button>
        <button
          onClick={() => void onSave(value)}
          disabled={saving}
          className="px-4 py-2 rounded-lg bg-white-600 hover:bg-white-500 disabled:opacity-50 font-semibold text-sm"
        >
          {saving ? "Đang lưu…" : mode === "create" ? "Tạo câu" : "Lưu"}
        </button>
      </div>
    </SidePanel>
  );
}

export default EditBankSidebar;

import { useEffect, useState, type ChangeEvent } from "react";
import { SidePanel } from "@/components/shared/ui/SidePanel";
import { RenderMedia } from "@/components/shared/RenderMedia";

/** Bank tối thiểu để sửa — BankTab & QAuthorBankPage đều thỏa. */
export interface EditableBank {
  bank_code: string;
  content: string;
  answer: string;
  media_url: string | null;
}

export interface BankEditValue {
  content: string;
  answer: string;
  mediaUrl: string;
}

const EMPTY: BankEditValue = { content: "", answer: "", mediaUrl: "" };

interface EditBankPanelProps {
  item: EditableBank | null;
  onClose: () => void;
  onSave: (value: BankEditValue) => void | Promise<void>;
}

/** Panel sửa bank + preview media (SidePanel) — dùng chung BankTab/QAuthorBankPage. */
export function EditBankPanel({ item, onClose, onSave }: EditBankPanelProps) {
  const [value, setValue] = useState<BankEditValue>(EMPTY);
  const open = item !== null;

  // Reset form mỗi lần mở panel (item đổi hoặc mở lại lần nữa).
  useEffect(() => {
    if (!open || !item) return;
    setValue({
      content: item.content,
      answer: item.answer,
      mediaUrl: item.media_url ?? "",
    });
  }, [open, item]);

  const set =
    (key: keyof BankEditValue) =>
    (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setValue((prev) => ({ ...prev, [key]: e.target.value }));

  const inputClass =
    "px-3 py-2 rounded-lg bg-blue-900 border border-blue-700 text-white text-sm";

  return (
    <SidePanel open={open} onClose={onClose} title="Sửa bank + chèn media">
      <p className="text-xs text-blue-400 font-mono -mt-2">{item?.bank_code}</p>
      <label className="text-xs text-blue-300">Nội dung</label>
      <textarea
        rows={3}
        value={value.content}
        onChange={set("content")}
        className={`${inputClass} resize-none`}
      />
      <label className="text-xs text-blue-300">Đáp án</label>
      <input value={value.answer} onChange={set("answer")} className={inputClass} />
      <label className="text-xs text-blue-300">Media URL (S3 key)</label>
      <input
        value={value.mediaUrl}
        onChange={set("mediaUrl")}
        placeholder="questions/QB_.../file.mp4"
        className={`${inputClass} font-mono`}
      />
      {value.mediaUrl.trim() && (
        <div className="rounded-lg bg-blue-950 border border-blue-700 p-3">
          <p className="text-xs text-blue-300 mb-2">Preview:</p>
          <div className="max-h-64 overflow-hidden rounded">
            <RenderMedia mediaUrl={value.mediaUrl.trim()} />
          </div>
        </div>
      )}
      <div className="flex gap-2 justify-end">
        <button
          onClick={onClose}
          className="px-4 py-2 rounded-lg bg-blue-800 hover:bg-blue-700 text-sm"
        >
          Huỷ
        </button>
        <button
          onClick={() => void onSave(value)}
          className="px-4 py-2 rounded-lg bg-white-600 hover:bg-white-500 font-semibold text-sm"
        >
          Lưu
        </button>
      </div>
    </SidePanel>
  );
}

export default EditBankPanel;

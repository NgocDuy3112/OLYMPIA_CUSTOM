import { useEffect, useState, type ChangeEvent } from "react";
import { SidePanel } from "@/components/shared/ui/SidePanel";

const LETTERS = ["A", "B", "C", "D", "E", "F"];

/** Câu vòng loại tối thiểu để sửa — QualifierTab & QAuthorQualifierPage đều thỏa. */
export interface EditableQualifier {
  questionCode: string;
  content: string;
  options: string[];
  correctOption: string;
  position: number;
}

export interface QualifierEditValue {
  content: string;
  options: string;
  correctOption: string;
  position: string;
}

const EMPTY: QualifierEditValue = {
  content: "",
  options: "",
  correctOption: "A",
  position: "1",
};

interface EditQualifierPanelProps {
  item: EditableQualifier | null;
  onClose: () => void;
  onSave: (value: QualifierEditValue) => void | Promise<void>;
}

/** Panel sửa câu vòng loại (SidePanel) — dùng chung QualifierTab/QAuthorQualifierPage. */
export function EditQualifierPanel({
  item,
  onClose,
  onSave,
}: EditQualifierPanelProps) {
  const [value, setValue] = useState<QualifierEditValue>(EMPTY);
  const open = item !== null;

  // Reset form mỗi lần mở panel (item đổi hoặc mở lại lần nữa).
  useEffect(() => {
    if (!open || !item) return;
    setValue({
      content: item.content,
      options: JSON.stringify(item.options),
      correctOption: item.correctOption || "A",
      position: String(item.position),
    });
  }, [open, item]);

  const set =
    (key: keyof QualifierEditValue) =>
    (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setValue((prev) => ({ ...prev, [key]: e.target.value }));

  const inputClass =
    "px-3 py-2 rounded-lg bg-blue-900 border border-blue-700 text-white text-sm";

  return (
    <SidePanel open={open} onClose={onClose} title="Sửa câu vòng loại">
      <p className="text-xs text-blue-400 font-mono -mt-2">
        {item?.questionCode}
      </p>
      <label className="text-xs text-blue-300">Nội dung</label>
      <textarea
        rows={3}
        value={value.content}
        onChange={set("content")}
        className={`${inputClass} resize-none`}
      />
      <label className="text-xs text-blue-300">Options (JSON hoặc A|B|C|D)</label>
      <input
        value={value.options}
        onChange={set("options")}
        className={`${inputClass} font-mono`}
      />
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-blue-300">Đáp án đúng</label>
          <select
            value={value.correctOption}
            onChange={set("correctOption")}
            className={`w-full ${inputClass}`}
          >
            {LETTERS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-blue-300">Vị trí 1-16</label>
          <input
            value={value.position}
            onChange={set("position")}
            className={`w-full ${inputClass} font-mono`}
          />
        </div>
      </div>
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

export default EditQualifierPanel;

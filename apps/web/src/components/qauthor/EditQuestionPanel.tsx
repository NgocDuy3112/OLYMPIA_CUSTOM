import { useEffect, useState, type ChangeEvent } from "react";
import { SidePanel } from "@/components/shared/ui/SidePanel";

/** Câu hỏi tối thiểu để sửa — MatchTab. */
export interface EditableQuestion {
  question_code: string;
  content: string;
  answer: string;
  explanation: string | null;
  media_url: string | null;
  options?: string | null;
  hintText?: string | null;
  hint_text?: string | null;
}

export interface QuestionEditValue {
  content: string;
  answer: string;
  explanation: string;
  hintText: string;
  mediaUrl: string;
  options: string;
}

const EMPTY: QuestionEditValue = {
  content: "",
  answer: "",
  explanation: "",
  hintText: "",
  mediaUrl: "",
  options: "",
};

interface EditQuestionPanelProps {
  item: EditableQuestion | null;
  onClose: () => void;
  onSave: (value: QuestionEditValue) => void | Promise<void>;
}

/** Panel sửa câu hỏi (SidePanel) — dùng cho MatchTab. */
export function EditQuestionPanel({
  item,
  onClose,
  onSave,
}: EditQuestionPanelProps) {
  const [value, setValue] = useState<QuestionEditValue>(EMPTY);
  const open = item !== null;

  // Reset form mỗi lần mở panel (item đổi hoặc mở lại lần nữa).
  useEffect(() => {
    if (!open || !item) return;
    setValue({
      content: item.content,
      answer: item.answer,
      explanation: item.explanation ?? "",
      hintText: item.hint_text ?? item.hintText ?? "",
      mediaUrl: item.media_url ?? "",
      options: typeof item.options === "string" ? item.options : "",
    });
  }, [open, item]);

  const set =
    (key: keyof QuestionEditValue) =>
    (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setValue((prev) => ({ ...prev, [key]: e.target.value }));

  const inputClass =
    "px-3 py-2 rounded-lg bg-blue-900 border border-blue-700 text-white text-sm";

  return (
    <SidePanel
      open={open}
      onClose={onClose}
      title="Sửa câu hỏi"
      footer={
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
      }
    >
      <p className="text-xs text-blue-400 font-mono -mt-2">
        {item?.question_code}
      </p>
      <label className="text-xs text-blue-300">Nội dung</label>
      <textarea
        rows={3}
        value={value.content}
        onChange={set("content")}
        className={`${inputClass} resize-none`}
      />
      <label className="text-xs text-blue-300">Đáp án</label>
      <input value={value.answer} onChange={set("answer")} className={inputClass} />
      <label className="text-xs text-blue-300">Giải thích</label>
      <input
        value={value.explanation}
        onChange={set("explanation")}
        className={inputClass}
      />
      <label className="text-xs text-blue-300">Gợi ý GIAI_MA</label>
      <input
        value={value.hintText}
        onChange={set("hintText")}
        className={inputClass}
      />
      <label className="text-xs text-blue-300">Media URL</label>
      <input
        value={value.mediaUrl}
        onChange={set("mediaUrl")}
        className={`${inputClass} font-mono`}
      />
      <label className="text-xs text-blue-300">Options (JSON hoặc A|B|C)</label>
      <input
        value={value.options}
        onChange={set("options")}
        className={`${inputClass} font-mono`}
      />
    </SidePanel>
  );
}

export default EditQuestionPanel;

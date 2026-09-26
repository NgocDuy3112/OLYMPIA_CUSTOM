import { useEffect, useState, type ChangeEvent } from "react";
import { Plus } from "lucide-react";
import { SidePanel } from "@/components/shared/ui/SidePanel";
import { RenderMedia } from "@/components/shared/RenderMedia";

export interface MatchQuestionCreateValue {
  questionCode: string;
  content: string;
  answer: string;
  explanation: string;
  hintText: string;
  mediaUrl: string;
  options: string;
}

const EMPTY: MatchQuestionCreateValue = {
  questionCode: "",
  content: "",
  answer: "",
  explanation: "",
  hintText: "",
  mediaUrl: "",
  options: "",
};

interface MatchQuestionCreatePanelProps {
  open: boolean;
  saving: boolean;
  onClose: () => void;
  onCreate: (value: MatchQuestionCreateValue) => void | Promise<void>;
}

/** Panel soạn câu tay trong sidebar phải — thay form inline cũ. */
export function MatchQuestionCreatePanel({
  open,
  saving,
  onClose,
  onCreate,
}: MatchQuestionCreatePanelProps) {
  const [value, setValue] = useState<MatchQuestionCreateValue>(EMPTY);

  useEffect(() => {
    if (open) setValue(EMPTY);
  }, [open ]);

  const set =
    (key: keyof MatchQuestionCreateValue) =>
    (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setValue((prev) => ({ ...prev, [key]: e.target.value }));

  const inputClass =
    "px-3 py-2 rounded-lg bg-blue-900 border border-blue-700 text-white text-sm";
  const canSave =
    value.questionCode.trim() !== "" &&
    value.content.trim() !== "" &&
    value.answer.trim() !== "";

  return (
    <SidePanel
      open={open}
      onClose={onClose}
      title="Soạn câu mới"
      wide
      footer={
        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-blue-800 hover:bg-blue-700 text-sm transition-colors"
          >
            Huỷ
          </button>
          <button
            onClick={() => void onCreate(value)}
            disabled={saving || !canSave}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 font-semibold text-sm"
          >
            <Plus size={16} /> {saving ? "Đang tạo…" : "Tạo câu hỏi"}
          </button>
        </div>
      }
    >
      <p className="text-xs text-gray-400 -mt-2">
        Ít dùng — nên pick từ bank đã duyệt theo slot.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-blue-300">Mã câu hỏi *</span>
          <input
            value={value.questionCode}
            onChange={set("questionCode")}
            placeholder="OC3_Q_KD_C_1"
            className={`${inputClass} font-mono`}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-blue-300">Đáp án *</span>
          <input value={value.answer} onChange={set("answer")} className={inputClass} />
        </label>
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-blue-300">Nội dung *</span>
        <textarea
          rows={3}
          value={value.content}
          onChange={set("content")}
          className={`${inputClass} resize-none`}
        />
      </label>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-blue-300">Giải thích</span>
          <input value={value.explanation} onChange={set("explanation")} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-blue-300">Gợi ý GIAI_MA</span>
          <input value={value.hintText} onChange={set("hintText")} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-blue-300">Media URL</span>
          <input
            value={value.mediaUrl}
            onChange={set("mediaUrl")}
            className={`${inputClass} font-mono`}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-blue-300">Options JSON</span>
          <input
            value={value.options}
            onChange={set("options")}
            className={`${inputClass} font-mono`}
          />
        </label>
      </div>
      {value.mediaUrl.trim() && (
        <div className="rounded-lg bg-white/5 border border-white/10 p-3">
          <p className="text-xs text-blue-300 mb-2">Preview media:</p>
          <div className="max-h-64 overflow-hidden rounded">
            <RenderMedia mediaUrl={value.mediaUrl.trim()} />
          </div>
        </div>
      )}
    </SidePanel>
  );
}

export default MatchQuestionCreatePanel;

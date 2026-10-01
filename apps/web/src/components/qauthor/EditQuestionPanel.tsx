import { useEffect, useState, type ChangeEvent } from "react";
import { SidePanel } from "@/components/shared/ui/SidePanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

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
    "px-3 py-2 rounded-lg bg-background/60 border border-border text-foreground text-sm";

  return (
    <SidePanel
      open={open}
      onClose={onClose}
      title="Sửa câu hỏi"
      footer={
        <div className="flex gap-2 justify-end">
          <Button
            variant="ghost"
            onClick={onClose}
            className="bg-accent/50 hover:bg-accent text-sm"
          >
            Huỷ
          </Button>
          <Button
            variant="default"
            onClick={() => void onSave(value)}
            className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-sm"
          >
            Lưu
          </Button>
        </div>
      }
    >
      <p className="text-xs text-primary font-mono -mt-2">
        {item?.question_code}
      </p>
      <label className="text-xs text-brand">Nội dung</label>
      <Textarea
        rows={3}
        value={value.content}
        onChange={set("content")}
        className={`${inputClass} resize-none`}
      />
      <label className="text-xs text-brand">Đáp án</label>
      <Input value={value.answer} onChange={set("answer")} className={inputClass} />
      <label className="text-xs text-brand">Giải thích</label>
      <Input
        value={value.explanation}
        onChange={set("explanation")}
        className={inputClass}
      />
      <label className="text-xs text-brand">Gợi ý GIAI_MA</label>
      <Input
        value={value.hintText}
        onChange={set("hintText")}
        className={inputClass}
      />
      <label className="text-xs text-brand">Media URL</label>
      <Input
        value={value.mediaUrl}
        onChange={set("mediaUrl")}
        className={`${inputClass} font-mono`}
      />
      <label className="text-xs text-brand">Options (JSON hoặc A|B|C)</label>
      <Input
        value={value.options}
        onChange={set("options")}
        className={`${inputClass} font-mono`}
      />
    </SidePanel>
  );
}

export default EditQuestionPanel;

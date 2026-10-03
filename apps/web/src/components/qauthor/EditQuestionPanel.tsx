import { useEffect, useState, type ChangeEvent } from "react";
import { SidePanel } from "@/components/shared/ui/SidePanel";
import {
  FormField,
  formInputClass,
} from "@/components/shared/ui/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

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

export function EditQuestionPanel({
  item,
  onClose,
  onSave,
}: EditQuestionPanelProps) {
  const [value, setValue] = useState<QuestionEditValue>(EMPTY);
  const open = item !== null;

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
            className="text-primary-foreground font-semibold text-sm"
          >
            Lưu
          </Button>
        </div>
      }
    >
      <p className="text-xs text-muted-foreground font-mono">
        {item?.question_code}
      </p>
      <FormField label="Nội dung">
        <Textarea
          rows={3}
          value={value.content}
          onChange={set("content")}
          className="resize-none"
        />
      </FormField>
      <FormField label="Đáp án">
        <Input
          value={value.answer}
          onChange={set("answer")}
          className={formInputClass}
        />
      </FormField>
      <FormField label="Giải thích">
        <Input
          value={value.explanation}
          onChange={set("explanation")}
          className={formInputClass}
        />
      </FormField>
      <FormField label="Gợi ý GIAI_MA">
        <Input
          value={value.hintText}
          onChange={set("hintText")}
          className={formInputClass}
        />
      </FormField>
      <FormField label="Media URL">
        <Input
          value={value.mediaUrl}
          onChange={set("mediaUrl")}
          className={`${formInputClass} font-mono`}
        />
      </FormField>
      <FormField
        label="Options"
        hint="JSON array hoặc phân cách bằng | (VD: A|B|C)"
      >
        <Input
          value={value.options}
          onChange={set("options")}
          className={`${formInputClass} font-mono`}
        />
      </FormField>
    </SidePanel>
  );
}

export default EditQuestionPanel;

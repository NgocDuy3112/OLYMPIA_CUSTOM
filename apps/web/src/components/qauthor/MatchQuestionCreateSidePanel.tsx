import { useEffect, useState, type ChangeEvent } from "react";
import { Plus } from "lucide-react";
import { SidePanel } from "@/components/shared/ui/SidePanel";
import {
  FormField,
  formInputClass,
  formSectionClass,
} from "@/components/shared/ui/form";
import { RenderMedia } from "@/components/shared/RenderMedia";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

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

interface MatchQuestionCreateSidePanelProps {
  open: boolean;
  saving: boolean;
  onClose: () => void;
  onCreate: (value: MatchQuestionCreateValue) => void | Promise<void>;
}

export function MatchQuestionCreateSidePanel({
  open,
  saving,
  onClose,
  onCreate,
}: MatchQuestionCreateSidePanelProps) {
  const [value, setValue] = useState<MatchQuestionCreateValue>(EMPTY);

  useEffect(() => {
    if (open) setValue(EMPTY);
  }, [open ]);

  const set =
    (key: keyof MatchQuestionCreateValue) =>
    (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setValue((prev) => ({ ...prev, [key]: e.target.value }));

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
          <Button
            variant="ghost"
            onClick={onClose}
            className="bg-accent/50 hover:bg-accent text-sm"
          >
            Huỷ
          </Button>
          <Button
            variant="default"
            onClick={() => void onCreate(value)}
            disabled={saving || !canSave}
            className="gap-2 bg-success hover:bg-success/90 disabled:opacity-50 font-semibold text-sm text-success-foreground"
          >
            <Plus size={16} /> {saving ? "Đang tạo…" : "Tạo câu hỏi"}
          </Button>
        </div>
      }
    >
      <p className="text-xs text-muted-foreground">
        Ít dùng — nên pick từ bank đã duyệt theo slot.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormField label="Mã câu hỏi" required>
          <Input
            value={value.questionCode}
            onChange={set("questionCode")}
            placeholder="OC3_Q_KD_C_1"
            className={`${formInputClass} `}
          />
        </FormField>
        <FormField label="Đáp án" required>
          <Input
            value={value.answer}
            onChange={set("answer")}
            className={formInputClass}
          />
        </FormField>
      </div>
      <FormField label="Nội dung" required>
        <Textarea
          rows={3}
          value={value.content}
          onChange={set("content")}
          className="resize-none"
        />
      </FormField>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
            className={`${formInputClass} `}
          />
        </FormField>
        <FormField label="Options JSON" hint="A|B|C hoặc JSON array">
          <Input
            value={value.options}
            onChange={set("options")}
            className={`${formInputClass} `}
          />
        </FormField>
      </div>
      {value.mediaUrl.trim() && (
        <div className="rounded-lg bg-accent/50 border border-border p-3">
          <p className={formSectionClass}>Preview media</p>
          <div className="max-h-64 overflow-hidden rounded">
            <RenderMedia mediaUrl={value.mediaUrl.trim()} />
          </div>
        </div>
      )}
    </SidePanel>
  );
}

export default MatchQuestionCreateSidePanel;

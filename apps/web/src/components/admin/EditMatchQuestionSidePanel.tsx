import { useEffect, useState } from "react";
import { SidePanel } from "@/components/shared/ui/SidePanel";
import { FormField, formInputClass } from "@/components/shared/ui/form";
import { MediaFilePicker } from "@/components/shared/MediaFilePicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { QuestionData } from "./gameTypes";

export interface MatchQuestionEditValue {
  content: string;
  answer: string;
  explanation: string;
  mediaUrl: string;
}

interface EditMatchQuestionSidePanelProps {
  item: QuestionData | null;
  matchCode: string;
  saving: boolean;
  onClose: () => void;
  onSave: (
    value: MatchQuestionEditValue,
    mediaFile: File | null,
  ) => void | Promise<void>;
}

export function EditMatchQuestionSidePanel({
  item,
  matchCode,
  saving,
  onClose,
  onSave,
}: EditMatchQuestionSidePanelProps) {
  const [content, setContent] = useState("");
  const [answer, setAnswer] = useState("");
  const [explanation, setExplanation] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const open = item !== null;

  useEffect(() => {
    if (!open || !item) return;
    setContent(item.content);
    setAnswer(item.answer);
    setExplanation(item.explanation ?? "");
    setMediaUrl(item.media_url ?? "");
    setMediaFile(null);
  }, [open, item]);

  useEffect(() => {
    if (!open || !item || mediaFile) return;
    if (!matchCode || !item.question_code) return;
    const ext = mediaUrl ? mediaUrl.split(".").pop() || "png" : "png";
    const suggestedKey = `${matchCode}/${item.question_code}.${ext}`;
    if (!mediaUrl || mediaUrl.startsWith(matchCode)) {
      setMediaUrl(suggestedKey);
    }
  }, [open, item, matchCode, mediaUrl, mediaFile]);

  const handlePickFile = (file: File | null) => {
    if (!file || !item) {
      setMediaFile(null);
      return;
    }
    setMediaFile(file);
    const ext = file.name.split(".").pop() || "png";
    const suggestedKey =
      matchCode && item.question_code
        ? `${matchCode}/${item.question_code}.${ext}`
        : `filename.${ext}`;
    setMediaUrl(suggestedKey);
  };

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
            onClick={() => void onSave({ content, answer, explanation, mediaUrl }, mediaFile)}
            disabled={saving || !content.trim() || !answer.trim()}
            className="text-primary-foreground disabled:opacity-50 font-semibold text-sm"
          >
            {saving ? "Đang lưu…" : "Lưu thay đổi"}
          </Button>
        </div>
      }
    >
      <p className="text-xs text-muted-foreground ">
        {item?.question_code}
      </p>
      <FormField label="Nội dung">
        <Textarea
          rows={3}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="resize-none"
        />
      </FormField>
      <FormField label="Đáp án">
        <Input
          type="text"
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          className={formInputClass}
        />
      </FormField>
      <FormField label="Giải thích" hint="Tuỳ chọn">
        <Input
          type="text"
          value={explanation}
          onChange={(e) => setExplanation(e.target.value)}
          className={formInputClass}
        />
      </FormField>
      <FormField label="Media URL / S3 key">
        <div className="flex flex-col gap-2">
          <Input
            type="text"
            value={mediaUrl}
            onChange={(e) => setMediaUrl(e.target.value)}
            placeholder="OC3_M01T/OC3_Q_... (VD: OC<number>_M_*/OC<number>_Q_*)"
            className={`${formInputClass} `}
          />
          <MediaFilePicker
            value={mediaFile}
            onChange={handlePickFile}
            dropLabel="Chọn file mới"
          />
          {mediaFile && (
            <span className="text-xs text-success whitespace-nowrap">
              Sẽ upload khi lưu
            </span>
          )}
          {mediaUrl && (
            <div className="text-xs text-muted-foreground">
              S3 key: <span className="">{mediaUrl}</span>
            </div>
          )}
        </div>
      </FormField>
    </SidePanel>
  );
}

export default EditMatchQuestionSidePanel;

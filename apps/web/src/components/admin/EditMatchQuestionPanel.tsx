import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { SidePanel } from "@/components/shared/ui/SidePanel";
import type { QuestionData } from "./gameTypes";

export interface MatchQuestionEditValue {
  content: string;
  answer: string;
  explanation: string;
  mediaUrl: string;
}

interface EditMatchQuestionPanelProps {
  item: QuestionData | null;
  /** Tiền tố S3 key gợi ý: questionsMatchCode || matchCode. */
  matchCode: string;
  saving: boolean;
  onClose: () => void;
  onSave: (
    value: MatchQuestionEditValue,
    mediaFile: File | null,
  ) => void | Promise<void>;
}

/**
 * Panel sửa câu hỏi trận đấu — có upload file media (presign qua page).
 * Tự reset form khi mở; tự điền S3 key gợi ý `${matchCode}/${question_code}.${ext}`.
 */
export function EditMatchQuestionPanel({
  item,
  matchCode,
  saving,
  onClose,
  onSave,
}: EditMatchQuestionPanelProps) {
  const [content, setContent] = useState("");
  const [answer, setAnswer] = useState("");
  const [explanation, setExplanation] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const open = item !== null;

  // Reset form mỗi lần mở panel.
  useEffect(() => {
    if (!open || !item) return;
    setContent(item.content);
    setAnswer(item.answer);
    setExplanation(item.explanation ?? "");
    setMediaUrl(item.media_url ?? "");
    setMediaFile(null);
    if (mediaInputRef.current) mediaInputRef.current.value = "";
  }, [open, item]);

  // Gợi ý S3 key khi user chưa chọn file và key còn rỗng/đúng prefix match.
  useEffect(() => {
    if (!open || !item || mediaFile) return;
    if (!matchCode || !item.question_code) return;
    const ext = mediaUrl ? mediaUrl.split(".").pop() || "png" : "png";
    const suggestedKey = `${matchCode}/${item.question_code}.${ext}`;
    if (!mediaUrl || mediaUrl.startsWith(matchCode)) {
      setMediaUrl(suggestedKey);
    }
  }, [open, item, matchCode, mediaUrl, mediaFile]);

  const inputClass =
    "px-3 py-2 rounded-lg bg-blue-900 border border-blue-700 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm";

  const handlePickFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !item) return;
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
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-blue-800 hover:bg-blue-700 text-sm transition-colors"
          >
            Huỷ
          </button>
          <button
            onClick={() => void onSave({ content, answer, explanation, mediaUrl }, mediaFile)}
            disabled={saving || !content.trim() || !answer.trim()}
            className="px-4 py-2 rounded-lg bg-white-600 hover:bg-white-500 disabled:opacity-50 font-semibold text-sm transition-colors"
          >
            {saving ? "Đang lưu…" : "Lưu thay đổi"}
          </button>
        </div>
      }
    >
      <p className="text-xs text-blue-400 font-mono -mt-2">
        {item?.question_code}
      </p>
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-blue-300">Nội dung</label>
          <textarea
            rows={3}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className={`${inputClass} resize-none`}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-blue-300">Đáp án</label>
          <input
            type="text"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            className={inputClass}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-blue-300">Giải thích</label>
          <input
            type="text"
            value={explanation}
            onChange={(e) => setExplanation(e.target.value)}
            placeholder="(tuỳ chọn)"
            className={`${inputClass} placeholder-blue-400`}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-blue-300">Media URL / S3 key</label>
          <div className="flex flex-col gap-2">
            <input
              type="text"
              value={mediaUrl}
              onChange={(e) => setMediaUrl(e.target.value)}
              placeholder="OC3_M01T/OC3_Q_... (VD: OC<number>_M_*/OC<number>_Q_*)"
              className={`${inputClass} font-mono`}
            />
            <div className="flex items-center gap-2">
              <input
                ref={mediaInputRef}
                type="file"
                accept="image/*,audio/*,video/*"
                className="hidden"
                onChange={handlePickFile}
              />
              <button
                onClick={() => mediaInputRef.current?.click()}
                className="flex-1 px-3 py-2 rounded-lg bg-blue-700 hover:bg-blue-600 text-white text-sm truncate"
                title="Upload file mới"
              >
                {mediaFile ? mediaFile.name : "Chọn file mới"}
              </button>
              {mediaFile && (
                <span className="text-xs text-green-400 whitespace-nowrap">
                  Sẽ upload khi lưu
                </span>
              )}
            </div>
            {mediaUrl && (
              <div className="text-xs text-blue-300">
                S3 key: <span className="font-mono">{mediaUrl}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </SidePanel>
  );
}

export default EditMatchQuestionPanel;

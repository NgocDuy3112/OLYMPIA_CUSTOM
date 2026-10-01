import { useEffect, useState, type ChangeEvent } from "react";
import { SidePanel } from "@/components/shared/ui/SidePanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { QualifierOptionsInput } from "./QualifierOptionsInput";

/** Câu vòng loại tối thiểu để sửa — QualifierTab. */
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

/** Panel sửa câu vòng loại (SidePanel) — dùng cho QualifierTab. */
export function EditQualifierPanel({
  item,
  onClose,
  onSave,
}: EditQualifierPanelProps) {
  const [value, setValue] = useState<QualifierEditValue>(EMPTY);
  const [optionList, setOptionList] = useState<string[]>(["", "", "", ""]);
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
    const opts = [...item.options];
    while (opts.length < 4) opts.push("");
    setOptionList(opts.slice(0, 6));
  }, [open, item]);

  const set =
    (key: keyof QualifierEditValue) =>
    (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setValue((prev) => ({ ...prev, [key]: e.target.value }));

  const inputClass =
    "px-3 py-2 rounded-lg bg-background/60 border border-border text-foreground text-sm";

  return (
    <SidePanel
      open={open}
      onClose={onClose}
      title="Sửa câu vòng loại"
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
            onClick={() => {
              const filled = optionList.map((s) => s.trim());
              if (filled.some((s) => !s)) {
                alert("Nhập đủ phương án.");
                return;
              }
              void onSave({ ...value, options: JSON.stringify(filled) });
            }}
            className="bg-primary hover:bg-primary/90 text-white font-semibold text-sm"
          >
            Lưu
          </Button>
        </div>
      }
    >
      <p className="text-xs text-primary font-mono -mt-2">
        {item?.questionCode}
      </p>
      <label className="text-xs text-brand">Nội dung</label>
      <Textarea
        rows={3}
        value={value.content}
        onChange={set("content")}
        className={`${inputClass} resize-none`}
      />
      <label className="text-xs text-brand">Phương án (bấm để chọn đáp án đúng)</label>
      <QualifierOptionsInput
        options={optionList}
        correct={value.correctOption}
        onChange={setOptionList}
        onCorrectChange={(correctOption) => setValue((prev) => ({ ...prev, correctOption }))}
      />
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-brand">Vị trí 1-16</label>
          <Input
            value={value.position}
            onChange={set("position")}
            className={`w-full ${inputClass} font-mono`}
          />
        </div>
      </div>
    </SidePanel>
  );
}

export default EditQualifierPanel;

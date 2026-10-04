import type { ReactNode } from "react";
import { CloudUpload } from "lucide-react";
import {
  FileUpload,
  FileUploadDropzone,
  FileUploadItem,
  FileUploadItemDelete,
  FileUploadItemMetadata,
  FileUploadItemPreview,
  FileUploadList,
  FileUploadTrigger,
  useFileUpload,
} from "@/components/ui/file-upload";
import { cn } from "cn";

export const MEDIA_ACCEPT = "image/*,audio/*,video/*";

interface MediaFilePickerProps {
  value?: File | null;
  onChange: (file: File | null) => void;
  accept?: string;
  maxSize?: number;
  disabled?: boolean;
  dropLabel?: string;
  className?: string;
  onValidate?: (file: File) => string | null | undefined;
}

function PickerList() {
  const files = useFileUpload((s) => Array.from(s.files.keys()));
  return (
    <FileUploadList>
      {files.map((file) => (
        <FileUploadItem
          key={`${file.name}-${file.size}-${file.lastModified}`}
          value={file}
          className="rounded-lg bg-primary/10 border border-primary/30 p-3"
        >
          <FileUploadItemPreview className="max-h-48 overflow-hidden rounded" />
          <FileUploadItemMetadata />
          <FileUploadItemDelete />
        </FileUploadItem>
      ))}
    </FileUploadList>
  );
}

/** Single-file picker: drag-drop zone + preview list. Controlled via File|null. */
export function MediaFilePicker({
  value,
  onChange,
  accept = MEDIA_ACCEPT,
  maxSize,
  disabled,
  dropLabel = "Kéo thả file vào đây hoặc bấm để chọn",
  className,
  onValidate,
}: MediaFilePickerProps) {
  return (
    <FileUpload
      value={value ? [value] : []}
      onValueChange={(files) => onChange(files[0] ?? null)}
      onFileValidate={onValidate}
      accept={accept}
      maxFiles={1}
      maxSize={maxSize}
      multiple={false}
      disabled={disabled}
      className={cn("flex flex-col gap-2", className)}
    >
      {!value && (
        <FileUploadDropzone className="flex cursor-pointer flex-col items-center gap-1 rounded-lg bg-accent/50 px-4 py-6 text-center text-sm hover:bg-accent data-[dragging]:border-primary data-[dragging]:bg-accent">
          <CloudUpload className="size-6 text-muted-foreground" />
          <span>{dropLabel}</span>
        </FileUploadDropzone>
      )}
      <PickerList />
    </FileUpload>
  );
}

interface MediaUploadButtonProps {
  onChange: (file: File) => void;
  accept?: string;
  maxSize?: number;
  disabled?: boolean;
  className?: string;
  children?: ReactNode;
  onValidate?: (file: File) => string | null | undefined;
}

/** Trigger-only picker (no list): parent uploads immediately on select. */
export function MediaUploadButton({
  onChange,
  accept = MEDIA_ACCEPT,
  maxSize,
  disabled,
  className,
  children = "Chọn file",
  onValidate,
}: MediaUploadButtonProps) {
  return (
    <FileUpload
      onValueChange={(files) => {
        if (files[0]) onChange(files[0]);
      }}
      onFileValidate={onValidate}
      accept={accept}
      maxFiles={1}
      maxSize={maxSize}
      multiple={false}
      disabled={disabled}
    >
      <FileUploadTrigger className={className}>{children}</FileUploadTrigger>
    </FileUpload>
  );
}

import React from "react";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { cn } from "cn";

/** Label field chuẩn trong mọi panel edit: nhỏ, màu brand. */
export const formLabelClass = "text-xs font-medium text-brand";

/** Dòng gợi ý dưới input. */
export const formHintClass = "text-xs text-muted-foreground";

/** Tiêu đề nhóm field ("Cơ bản", "Thời gian"...). */
export const formSectionClass =
  "text-xs font-semibold uppercase tracking-wide text-muted-foreground";

/** Input/select cao 36px thống nhất (mặc định shadcn h-8 quá nhỏ cho form). */
export const formInputClass = "h-9";

interface FormFieldProps {
  label: string;
  /** Hiện dấu * + aria-required. */
  required?: boolean;
  /** Dòng mô tả dưới control (ẩn khi có error). */
  hint?: string;
  /** Lỗi validation — hiện bằng FieldError, tự set data-invalid. */
  error?: string;
  className?: string;
  children: React.ReactNode;
}

/**
 * Field chuẩn cho form trong SidePanel — bọc shadcn Field block
 * (FieldLabel + control + FieldDescription/FieldError).
 * Thay cặp `<label class="text-xs text-brand">` + input copy-paste từng file.
 */
export const FormField: React.FC<FormFieldProps> = ({
  label,
  required,
  hint,
  error,
  className,
  children,
}) => (
  <Field
    data-invalid={error ? true : undefined}
    aria-invalid={error ? true : undefined}
    className={cn("gap-1.5", className)}
  >
    <FieldLabel className={formLabelClass}>
      {label}
      {required && (
        <span className="text-destructive" aria-hidden>
          *
        </span>
      )}
    </FieldLabel>
    {children}
    {error ? (
      <FieldError className="text-xs">{error}</FieldError>
    ) : hint ? (
      <FieldDescription className={cn("mt-0.5", formHintClass)}>
        {hint}
      </FieldDescription>
    ) : null}
  </Field>
);

/** Tiêu đề nhóm field trong panel. */
export const FormSection: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className }) => (
  <p className={cn(formSectionClass, className)}>{children}</p>
);

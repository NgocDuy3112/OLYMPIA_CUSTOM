import React from "react";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { cn } from "cn";

export const formLabelClass = "text-xs font-medium text-brand";

export const formHintClass = "text-xs text-muted-foreground";

export const formSectionClass = "text-xs font-semibold uppercase tracking-wide text-muted-foreground";

export const formInputClass = "h-9 outline-none focus:border-ring";

interface FormFieldProps {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}

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

export const FormSection: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className }) => (
  <p className={cn(formSectionClass, className)}>{children}</p>
);

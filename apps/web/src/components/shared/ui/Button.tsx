import React from "react";
import { Button as ShadcnButton } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "cn";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost" | "success";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
}

// Map variant cũ sang shadcn buttonVariants + màu brand còn thiếu.
const VARIANT_MAP: Record<
  ButtonVariant,
  { variant?: "default" | "secondary" | "destructive" | "ghost"; className?: string }
> = {
  primary: { variant: "default" },
  // secondary cũ là nền trắng mờ — outline gần nhất trong shadcn.
  secondary: { variant: "secondary", className: "bg-white/10 text-white hover:bg-white/20 border-transparent" },
  danger: { variant: "destructive" },
  ghost: { variant: "ghost" },
  success: { className: "bg-green-600 text-white hover:bg-green-500" },
};

const SIZE_MAP: Record<ButtonSize, "sm" | "default" | "lg"> = {
  sm: "sm",
  md: "default",
  lg: "lg",
};

export const Button: React.FC<ButtonProps> = ({
  variant = "primary",
  size = "md",
  isLoading = false,
  leftIcon,
  rightIcon,
  fullWidth = false,
  className = "",
  disabled,
  children,
  ...props
}) => {
  const map = VARIANT_MAP[variant];
  return (
    <ShadcnButton
      variant={map.variant}
      size={SIZE_MAP[size]}
      className={cn(
        "touch-target",
        fullWidth && "w-full",
        map.className,
        className
      )}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? <Spinner /> : leftIcon}
      {children}
      {!isLoading && rightIcon}
    </ShadcnButton>
  );
};

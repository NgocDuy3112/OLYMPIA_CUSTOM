import React from "react";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "cn";

interface LoadingProps {
  size?: "sm" | "md" | "lg";
  fullScreen?: boolean;
  text?: string;
}

// Spinner shadcn là lucide Loader2Icon (`size-4`) — size cũ override qua className.
const SIZE_STYLES = {
  sm: "size-6",
  md: "size-8",
  lg: "size-12",
};

export const Loading: React.FC<LoadingProps> = ({
  size = "md",
  fullScreen = false,
  text,
}) => {
  const spinner = (
    <div className="flex flex-col items-center gap-3">
      <Spinner className={cn(SIZE_STYLES[size])} />
      {text && <p className="text-sm text-muted-foreground">{text}</p>}
    </div>
  );

  if (fullScreen) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        {spinner}
      </div>
    );
  }

  return spinner;
};

// Full page loading state
export const PageLoading: React.FC = () => (
  <Loading fullScreen size="lg" text="Đang tải..." />
);

// Inline loading state
export const InlineLoading: React.FC<{ text?: string }> = ({
  text = "Đang tải...",
}) => (
  <div className="flex justify-center items-center py-12">
    <Loading size="md" text={text} />
  </div>
);

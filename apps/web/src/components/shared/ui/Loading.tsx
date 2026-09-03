import React from "react";

interface LoadingProps {
  size?: "sm" | "md" | "lg";
  fullScreen?: boolean;
  text?: string;
}

const SIZE_STYLES = {
  sm: "w-6 h-6 border-2",
  md: "w-8 h-8 border-4",
  lg: "w-12 h-12 border-4",
};

export const Loading: React.FC<LoadingProps> = ({
  size = "md",
  fullScreen = false,
  text,
}) => {
  const spinner = (
    <div className="flex flex-col items-center gap-3">
      <div
        className={`
          animate-spin rounded-full border-blue-500 border-t-transparent
          ${SIZE_STYLES[size]}
        `}
      />
      {text && <p className="text-sm text-gray-400">{text}</p>}
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

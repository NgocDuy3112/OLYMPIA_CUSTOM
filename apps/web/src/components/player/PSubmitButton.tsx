import React from "react";
import PingIconStyle from "@/components/shared/PingIconStyle";
import { Button } from "@/components/ui/button";

interface PSubmitButtonProps {
  isEnabled: boolean;
  isKeywordMode?: boolean;
  label?: string;
  onSubmit: () => void;
}

export const PSubmitButton: React.FC<PSubmitButtonProps> = ({
  isEnabled,
  isKeywordMode,
  label,
  onSubmit,
}) => {
  const isDisabled = !isEnabled;
  return (
    <Button
      variant="default"
      onClick={onSubmit}
      disabled={isDisabled}
      className={`h-10 w-full rounded-lg px-4 text-base font-bold shadow-md transition duration-200 flex items-center justify-center
                ${
                  isDisabled
                    ? "bg-blue-900 ring-blue-600 ring-4 text-blue-300 cursor-not-allowed"
                    : "bg-blue-600 ring-blue-300 ring-4 text-white"
                }`}
    >
      <PingIconStyle isKeywordMode={!!isKeywordMode} />
      {label || "BẤM CHUÔNG ĐỂ GIÀNH QUYỀN TRẢ LỜI"}
    </Button>
  );
};

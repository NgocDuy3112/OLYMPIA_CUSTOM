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
                    ? "bg-primary/40 ring-primary ring-4 text-brand cursor-not-allowed"
                    : "bg-primary ring-brand ring-4 text-primary-foreground"
                }`}
    >
      <PingIconStyle isKeywordMode={!!isKeywordMode} />
      {label || "BẤM CHUÔNG ĐỂ GIÀNH QUYỀN TRẢ LỜI"}
    </Button>
  );
};

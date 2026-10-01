import type { ButtonHTMLAttributes } from "react";
import { Button } from "@/components/ui/button";

interface CControlButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
}

export default function CControlButton({
  children,
  className,
  ...props
}: CControlButtonProps) {
  return (
    <Button
      variant="ghost"
      className={`rounded-none bg-primary/40 ring-primary ring-3 min-w-24 h-9 tablet:min-w-28 tablet:h-10 xl:min-w-40 xl:h-15 text-xs tablet:text-sm flex text-foreground items-center justify-center transition transform duration-200 hover:bg-primary/70 hover:scale-105 hover:shadow-lg disabled:opacity-50${className ? ` ${className}` : ""}`}
      {...props}
    >
      {children}
    </Button>
  );
}

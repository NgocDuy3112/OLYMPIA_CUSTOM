import React from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "cn";

interface SidePanelProps {
    open: boolean;
    onClose: () => void;
    title: string;
    tone?: "default" | "danger";
    /** Rộng nửa màn hình cho form nhiều field. */
    wide?: boolean;
    /** Thanh action dính đáy panel (Lưu/Xoá...) — nội dung giữa tự scroll. */
    footer?: React.ReactNode;
    children: React.ReactNode;
}

/**
 * Panel phải trỏ sang shadcn Sheet (Base UI).
 * Focus-trap, Esc, khoá scroll nền, animation — Base UI lo, bỏ hand-rolled.
 */
export const SidePanel: React.FC<SidePanelProps> = ({
    open,
    onClose,
    title,
    tone = "default",
    wide = false,
    footer,
    children,
}) => {
    return (
        <Sheet
            open={open}
            onOpenChange={(next) => {
                if (!next) onClose();
            }}
        >
            <SheetContent
                side="right"
                className={cn(
                    wide
                        ? "sm:w-1/2 sm:min-w-[560px] sm:max-w-none"
                        : "sm:w-96",
                )}
            >
                <SheetHeader>
                    <SheetTitle
                        className={cn(
                            "text-base font-bold",
                            tone === "danger" ? "text-red-300" : "",
                        )}
                    >
                        {title}
                    </SheetTitle>
                </SheetHeader>
                <div className="flex flex-col gap-4 flex-1 overflow-y-auto">
                    {children}
                </div>
                {footer && (
                    <SheetFooter className="border-t pt-2">
                        {footer}
                    </SheetFooter>
                )}
            </SheetContent>
        </Sheet>
    );
};

export default SidePanel;

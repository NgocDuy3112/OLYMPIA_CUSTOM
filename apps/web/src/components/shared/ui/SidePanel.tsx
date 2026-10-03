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
    wide?: boolean;
    footer?: React.ReactNode;
    children: React.ReactNode;
}

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
                            tone === "danger" ? "text-destructive" : "",
                        )}
                    >
                        {title}
                    </SheetTitle>
                </SheetHeader>
                <div className="flex flex-col gap-4 flex-1 overflow-y-auto px-4 pb-4">
                    {children}
                </div>
                {footer && (
                    <SheetFooter className="border-t border-border pt-2">
                        {footer}
                    </SheetFooter>
                )}
            </SheetContent>
        </Sheet>
    );
};

export default SidePanel;

import React, { useEffect, useRef } from "react";

interface SidePanelProps {
    open: boolean;
    onClose: () => void;
    title: string;
    tone?: "default" | "danger";
    /** Rộng nửa màn hình cho form nhiều field. */
    wide?: boolean;
    /** Thanh action dính đáy panel (Luưu/Xoá...) — nội dung giữa tự scroll. */
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
    const panelRef = useRef<HTMLElement>(null);
    const wasOpen = useRef(false);

    // Focus + khoá scroll nền: chỉ chạy đúng lúc panel vừa mở,
    // không chạy lại khi parent re-render (tránh giật focus khỏi input).
    useEffect(() => {
        if (open && !wasOpen.current) {
            wasOpen.current = true;
            const prevOverflow = document.body.style.overflow;
            document.body.style.overflow = "hidden";
            panelRef.current?.focus();
            return () => {
                wasOpen.current = false;
                document.body.style.overflow = prevOverflow;
            };
        }
        if (!open) {
            wasOpen.current = false;
        }
        return undefined;
    }, [open ]);

    // Esc đóng panel + focus-trap Tab.
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                onClose();
                return;
            }
            if (e.key !== "Tab") return;
            const el = panelRef.current;
            if (!el) return;
            const focusables = el.querySelectorAll<HTMLElement>(
                'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
            );
            if (focusables.length === 0) return;
            const first = focusables[0];
            const last = focusables[focusables.length - 1];
            const active = document.activeElement;
            if (!el.contains(active)) {
                e.preventDefault();
                first.focus();
            } else if (e.shiftKey && active === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && active === last) {
                e.preventDefault();
                first.focus();
            }
        };
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("keydown", onKey);
        };
    }, [open, onClose]);

    return (
    <div
        className={`fixed inset-0 z-50 ${open ? "" : "pointer-events-none"}`}
        aria-hidden={!open}
    >
        <div
            onClick={onClose}
            className={`absolute inset-0 bg-black/50 transition-opacity duration-200 ${open ? "opacity-100" : "opacity-0"}`}
        />
        <aside
            className={`absolute right-0 top-0 h-full w-full ${wide ? "sm:w-1/2 sm:min-w-[560px]" : "sm:w-96"} bg-[#14122b] border-l border-white/10 shadow-2xl p-5 flex flex-col gap-4 overflow-y-auto transition-transform duration-200 ease-out ${open ? "translate-x-0" : "translate-x-full"}`}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            ref={panelRef}
            tabIndex={-1}
        >
            <div className="sticky top-0 z-10 bg-[#14122b] pb-2 flex items-center justify-between">
                <h3
                    className={`text-base font-bold ${tone === "danger" ? "text-red-300" : "text-white"}`}
                >
                    {title}
                </h3>
                <button
                    onClick={onClose}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                    aria-label="Đóng"
                >
                    ✕
                </button>
            </div>
            <div className="flex flex-col gap-4 flex-1">{children}</div>
            {footer && (
                <div className="sticky bottom-0 z-10 bg-[#14122b] pt-2 pb-1 border-t border-white/10">
                    {footer}
                </div>
            )}
        </aside>
    </div>
    );
};

export default SidePanel;

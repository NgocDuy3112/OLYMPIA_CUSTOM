import React, { useEffect, useRef } from "react";

interface SidePanelProps {
    open: boolean;
    onClose: () => void;
    title: string;
    tone?: "default" | "danger";
    /** Rộng nửa màn hình cho form nhiều field. */
    wide?: boolean;
    children: React.ReactNode;
}

export const SidePanel: React.FC<SidePanelProps> = ({
    open,
    onClose,
    title,
    tone = "default",
    wide = false,
    children,
}) => {
    const panelRef = useRef<HTMLElement>(null);

    // Esc đóng panel + chặn scroll nền + focus-trap Tab.
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
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        panelRef.current?.focus();
        return () => {
            document.removeEventListener("keydown", onKey);
            document.body.style.overflow = prevOverflow;
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
            <div className="flex items-center justify-between">
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
        </aside>
    </div>
    );
};

export default SidePanel;

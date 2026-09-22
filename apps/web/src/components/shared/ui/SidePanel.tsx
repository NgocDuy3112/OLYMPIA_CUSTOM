import React, { useEffect } from "react";

interface SidePanelProps {
    open: boolean;
    onClose: () => void;
    title: string;
    tone?: "default" | "danger";
    children: React.ReactNode;
}

export const SidePanel: React.FC<SidePanelProps> = ({
    open,
    onClose,
    title,
    tone = "default",
    children,
}) => {
    // Esc đóng panel.
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
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
            className={`absolute right-0 top-0 h-full w-full sm:w-96 bg-blue-950 border-l-4 shadow-2xl p-6 flex flex-col gap-4 overflow-y-auto transition-transform duration-200 ease-out ${tone === "danger" ? "border-red-700" : "border-blue-600"
                } ${open ? "translate-x-0" : "translate-x-full"}`}
            role="dialog"
            aria-label={title}
        >
            <div className="flex items-center justify-between">
                <h3
                    className={`text-lg font-bold ${tone === "danger" ? "text-red-300" : "text-blue-200"}`}
                >
                    {title}
                </h3>
                <button
                    onClick={onClose}
                    className="p-1 rounded hover:bg-blue-800 transition-colors"
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

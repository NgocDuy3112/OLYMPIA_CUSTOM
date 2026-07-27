import { useEffect } from "react";

export function usePlayerProtection(enabled = true) {
    useEffect(() => {
        if (!enabled) return;

        const blockKeys = (e: KeyboardEvent) => {
            const key = e.key.toLowerCase();
            const ctrl = e.ctrlKey || e.metaKey;
            const shift = e.shiftKey;
            const alt = e.altKey;

            if (
                key === "f12" ||
                (ctrl && shift && (key === "i" || key === "j" || key === "c")) ||
                (ctrl && key === "u") ||
                (ctrl && alt && (key === "i" || key === "j" || key === "c"))
            ) {
                e.preventDefault();
                e.stopPropagation();
                return false;
            }

            if (
                ctrl &&
                (key === "c" || key === "v" || key === "x" || key === "a" || key === "s" || key === "p")
            ) {
                e.preventDefault();
                e.stopPropagation();
                return false;
            }

            if (ctrl && shift && (key === "3" || key === "4" || key === "5")) {
                e.preventDefault();
                e.stopPropagation();
                clearClipboard();
                return false;
            }

            if (shift && key === "printscreen") {
                e.preventDefault();
                e.stopPropagation();
                clearClipboard();
                return false;
            }

            if (key === "printscreen" || key === "snapshot") {
                e.preventDefault();
                e.stopPropagation();
                clearClipboard();
                return false;
            }
        };

        const clearClipboard = () => {
            try {

                navigator.clipboard?.writeText("").catch(() => {});
            } catch {

            }
        };

        const blockContextMenu = (e: MouseEvent) => {
            e.preventDefault();
            return false;
        };

        const blockDrag = (e: DragEvent) => {
            e.preventDefault();
            return false;
        };

        const blockSelect = (e: Event) => {
            e.preventDefault();
            return false;
        };

        let devtoolsOpen = false;
        const detectDevTools = () => {
            const threshold = 160;
            const start = performance.now();

            debugger;
            const end = performance.now();
            if (end - start > threshold && !devtoolsOpen) {
                devtoolsOpen = true;

            } else if (end - start <= threshold) {
                devtoolsOpen = false;
            }
        };

        const blockPrint = (e: Event) => {
            e.preventDefault();
            return false;
        };

        const handleKeyUp = (e: KeyboardEvent) => {
            const key = e.key.toLowerCase();
            if (key === "printscreen" || key === "snapshot") {
                e.preventDefault();
                e.stopPropagation();
                clearClipboard();
            }
        };

        const handleVisibilityChange = () => {
            const overlay = document.getElementById("player-protection-overlay");
            if (document.hidden) {
                if (!overlay) {
                    const el = document.createElement("div");
                    el.id = "player-protection-overlay";
                    el.style.cssText = `
                        position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
                        background: #000; z-index: 999999; display: flex;
                        align-items: center; justify-content: center;
                        color: #fff; font-size: 2rem; font-weight: bold;
                    `;
                    el.textContent = "⛔ Nội dung bị ẩn để bảo vệ";
                    document.body.appendChild(el);
                }

                clearClipboard();
            } else {

                overlay?.remove();
            }
        };

        const handleWindowBlur = () => {
            clearClipboard();
        };

        document.addEventListener("keydown", blockKeys, true);
        document.addEventListener("keyup", handleKeyUp, true);
        document.addEventListener("contextmenu", blockContextMenu, true);
        document.addEventListener("dragstart", blockDrag, true);
        document.addEventListener("selectstart", blockSelect, true);
        window.addEventListener("beforeprint", blockPrint, true);
        window.addEventListener("afterprint", blockPrint, true);
        window.addEventListener("blur", handleWindowBlur);
        document.addEventListener("visibilitychange", handleVisibilityChange);

        const intervalId = setInterval(detectDevTools, 2000);

        const styleId = "player-protection-styles";
        if (!document.getElementById(styleId)) {
            const style = document.createElement("style");
            style.id = styleId;
            style.textContent = `
                * {
                    -webkit-user-select: none !important;
                    -moz-user-select: none !important;
                    -ms-user-select: none !important;
                    user-select: none !important;
                    -webkit-touch-callout: none !important;
                }
                img, video {
                    pointer-events: none !important;
                    -webkit-user-drag: none !important;
                }
            `;
            document.head.appendChild(style);
        }

        return () => {
            document.removeEventListener("keydown", blockKeys, true);
            document.removeEventListener("keyup", handleKeyUp, true);
            document.removeEventListener("contextmenu", blockContextMenu, true);
            document.removeEventListener("dragstart", blockDrag, true);
            document.removeEventListener("selectstart", blockSelect, true);
            window.removeEventListener("beforeprint", blockPrint, true);
            window.removeEventListener("afterprint", blockPrint, true);
            window.removeEventListener("blur", handleWindowBlur);
            document.removeEventListener("visibilitychange", handleVisibilityChange);
            clearInterval(intervalId);
            const existingStyle = document.getElementById(styleId);
            if (existingStyle) {
                existingStyle.remove();
            }

            document.getElementById("player-protection-overlay")?.remove();
        };
    }, [enabled]);
}

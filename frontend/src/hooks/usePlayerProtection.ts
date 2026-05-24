import { useEffect } from "react";

/**
 * Hook to protect player pages from:
 * - DevTools (F12, Ctrl+Shift+I/J/C, right-click)
 * - Copy / paste / cut
 * - Screenshots (PrintScreen, Win+Shift+S, clipboard theft)
 * - Text selection and drag
 * - Page visibility (blur content when tab loses focus)
 */
export function usePlayerProtection(enabled = true) {
    useEffect(() => {
        if (!enabled) return;

        // ── 1. Block keyboard shortcuts ──
        const blockKeys = (e: KeyboardEvent) => {
            const key = e.key.toLowerCase();
            const ctrl = e.ctrlKey || e.metaKey;
            const shift = e.shiftKey;
            const alt = e.altKey;

            // DevTools shortcuts (Windows/Linux: Ctrl+Shift+I/J/C, F12; macOS: Cmd+Option+I/J/C)
            if (
                key === "f12" ||
                (ctrl && shift && (key === "i" || key === "j" || key === "c")) ||
                (ctrl && key === "u") || // View source
                (ctrl && alt && (key === "i" || key === "j" || key === "c")) // macOS Cmd+Option+I/J/C
            ) {
                e.preventDefault();
                e.stopPropagation();
                return false;
            }

            // Copy / paste / cut / select all / save / print
            // macOS: Cmd+C/V/X/A/S/P (metaKey), Windows/Linux: Ctrl+C/V/X/A/S/P
            if (
                ctrl &&
                (key === "c" || key === "v" || key === "x" || key === "a" || key === "s" || key === "p")
            ) {
                e.preventDefault();
                e.stopPropagation();
                return false;
            }

            // macOS screenshot shortcuts
            // Cmd+Shift+3 = fullscreen screenshot
            // Cmd+Shift+4 = area screenshot
            // Cmd+Shift+5 = screenshot toolbar
            if (ctrl && shift && (key === "3" || key === "4" || key === "5")) {
                e.preventDefault();
                e.stopPropagation();
                clearClipboard();
                return false;
            }

            // Linux screenshot shortcuts
            // Ctrl+PrintScreen (some distros), Shift+PrintScreen (area select)
            if (shift && key === "printscreen") {
                e.preventDefault();
                e.stopPropagation();
                clearClipboard();
                return false;
            }

            // Screenshot keys — catch on both keydown and keyup
            if (key === "printscreen" || key === "snapshot") {
                e.preventDefault();
                e.stopPropagation();
                clearClipboard();
                return false;
            }
        };

        // ── 2. Clear clipboard (anti-screenshot) ──
        const clearClipboard = () => {
            try {
                // Overwrite clipboard with empty string to flush any screenshot capture
                navigator.clipboard?.writeText("").catch(() => {});
            } catch {
                // Clipboard API may not be available
            }
        };

        // ── 3. Block context menu ──
        const blockContextMenu = (e: MouseEvent) => {
            e.preventDefault();
            return false;
        };

        // ── 4. Block drag ──
        const blockDrag = (e: DragEvent) => {
            e.preventDefault();
            return false;
        };

        // ── 5. Block selection ──
        const blockSelect = (e: Event) => {
            e.preventDefault();
            return false;
        };

        // ── 6. DevTools detection via debugger timing ──
        let devtoolsOpen = false;
        const detectDevTools = () => {
            const threshold = 160;
            const start = performance.now();
            // eslint-disable-next-line no-debugger
            debugger;
            const end = performance.now();
            if (end - start > threshold && !devtoolsOpen) {
                devtoolsOpen = true;
                // Optional: redirect, reload, or send alert
                // window.location.href = "/";
            } else if (end - start <= threshold) {
                devtoolsOpen = false;
            }
        };

        // ── 7. Block beforeprint / afterprint ──
        const blockPrint = (e: Event) => {
            e.preventDefault();
            return false;
        };

        // ── 8. Anti-screenshot: clear clipboard on keyup for PrintScreen ──
        // Some browsers only fire keyup for PrintScreen, not keydown
        const handleKeyUp = (e: KeyboardEvent) => {
            const key = e.key.toLowerCase();
            if (key === "printscreen" || key === "snapshot") {
                e.preventDefault();
                e.stopPropagation();
                clearClipboard();
            }
        };

        // ── 9. Anti-screenshot: blur page when tab loses focus ──
        // This covers Win+Shift+S, Snipping Tool, and other capture tools
        // that require the user to switch away from the browser.
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
                // Also clear clipboard when tab loses focus
                clearClipboard();
            } else {
                // Remove overlay when tab regains focus
                overlay?.remove();
            }
        };

        // ── 10. Anti-screenshot: clear clipboard on window blur ──
        // Covers Alt+Tab, clicking outside browser, etc.
        const handleWindowBlur = () => {
            clearClipboard();
        };

        // ── Register listeners ──
        document.addEventListener("keydown", blockKeys, true);
        document.addEventListener("keyup", handleKeyUp, true);
        document.addEventListener("contextmenu", blockContextMenu, true);
        document.addEventListener("dragstart", blockDrag, true);
        document.addEventListener("selectstart", blockSelect, true);
        window.addEventListener("beforeprint", blockPrint, true);
        window.addEventListener("afterprint", blockPrint, true);
        window.addEventListener("blur", handleWindowBlur);
        document.addEventListener("visibilitychange", handleVisibilityChange);

        // DevTools detection interval
        const intervalId = setInterval(detectDevTools, 2000);

        // ── Inject protection CSS ──
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
            // Remove overlay if still present
            document.getElementById("player-protection-overlay")?.remove();
        };
    }, [enabled]);
}

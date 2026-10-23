function hasControlChars(value: string): boolean {
    for (let i = 0; i < value.length; i++) {
        const code = value.charCodeAt(i);
        if (code < 0x20 || code === 0x7f) return true;
    }
    return false;
}

export function safeNextPath(raw: unknown): string {
    if (typeof raw !== "string") return "/";
    if (!raw.startsWith("/")) return "/";
    if (raw.startsWith("//") || raw.startsWith("/\\")) return "/";
    if (hasControlChars(raw)) return "/";
    return raw;
}

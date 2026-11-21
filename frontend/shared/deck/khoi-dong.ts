export type KhoiDongScreen = "khoi-dong-chung" | "khoi-dong-rieng"

export function khoiDongScreenOf(stage: string): KhoiDongScreen {
    if (stage === "phase2") return "khoi-dong-chung"
    return "khoi-dong-rieng"
}

export function khoiDongRailVariantOf(stage: string): "compact" | "answers" {
    if (stage === "phase2") return "answers"
    return "compact"
}

export interface SubmissionEntry {
    kind: "answer" | "keyword"
    answer: string
    elapsedS: number
}

export function formatElapsed(seconds: number): string {
    return seconds.toFixed(3)
}

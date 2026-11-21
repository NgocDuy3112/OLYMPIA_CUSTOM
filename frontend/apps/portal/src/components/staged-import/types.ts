import type { useQueryClient } from "@tanstack/react-query"
import { ApiError } from "@shared/lib/api"

export interface StagedBatch {
    id: string
    sourceName: string | null
    rowCount: number
    ready: number
    toFix: number
    dropped: number
    remaining: number
    createdAt: string
}

export interface SourceCells {
    question: string
    answer: string
    explanation: string
    note: string
    media: string
}

export interface StagedRow {
    id: string
    position: number
    sheet: string
    sourceId: string
    cells: SourceCells
    media: { url: string; type: "image" | "audio" | "video" } | null
    error: string | null
    warning: string | null
    dropped: boolean
    bucket: string | null
    kind: string | null
}

export interface CommitResult {
    created: number
    ids: string[]
    errors: Array<{ index: number; code: string; message: string; details: string[] }>
    assemblyRevision?: number
}

export const SHEETS = ["KHOI_DONG", "GIAI_MA", "BUT_PHA", "VE_DICH"] as const

export const EMPTY_CELLS: SourceCells = { question: "", answer: "", explanation: "", note: "", media: "" }

export const CELL_FIELDS: Array<{ key: keyof SourceCells; label: string }> = [
    { key: "question", label: "Câu hỏi" },
    { key: "answer", label: "Đáp án" },
    { key: "explanation", label: "Giải thích" },
    { key: "note", label: "Ghi chú" },
    { key: "media", label: "File ảnh/video/audio" },
]

export function messageOf(error: unknown): string {
    if (error instanceof ApiError) return error.message
    return "Something went wrong. Please try again."
}

export function invalidateAll(queryClient: ReturnType<typeof useQueryClient>) {
    void queryClient.invalidateQueries({ queryKey: ["questions"] })
    void queryClient.invalidateQueries({ queryKey: ["bucket-counts"] })
    void queryClient.invalidateQueries({ queryKey: ["question-imports"] })
    void queryClient.invalidateQueries({ queryKey: ["keyword-hints"] })
    void queryClient.invalidateQueries({ queryKey: ["keyword-list"] })
}

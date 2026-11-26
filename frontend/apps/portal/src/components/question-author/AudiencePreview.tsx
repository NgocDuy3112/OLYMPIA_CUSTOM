import type { ReactNode } from "react"
import type { AuthorDraft, PayloadShape } from "./payload-shape"

export function AudiencePreview({ shape, draft }: { shape: PayloadShape; draft: AuthorDraft }) {
    const options = draft.options.filter((o) => o.text.trim())
    const showsChoice = options.length > 0 && shape === "choice"
    let audienceNote = " — ô nhập như thí sinh"
    if (showsChoice) audienceNote = " — trắc nghiệm"
    let previewSlot: ReactNode = (
        <div className="rounded-md border border-input bg-background px-2 py-1 text-xs text-muted-foreground">
            Câu trả lời của bạn
        </div>
    )
    if (showsChoice) {
        previewSlot = (
            <div className="flex flex-wrap gap-1.5">
                {options.map((option, index) => (
                    <span
                        key={option.id}
                        className="rounded-md border border-input bg-background px-2 py-1 text-xs"
                    >
                        <b>{String.fromCharCode(65 + index)}.</b> {option.text}
                    </span>
                ))}
            </div>
        )
    }
    return (
        <div className="grid gap-2 rounded-lg border border-border bg-muted/40 p-3">
            <span className="text-xs font-medium text-muted-foreground">
                Khán giả thấy
                {audienceNote}
            </span>
            {previewSlot}
        </div>
    )
}

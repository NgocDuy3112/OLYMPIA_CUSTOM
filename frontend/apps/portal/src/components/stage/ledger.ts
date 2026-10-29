import { type ConsoleQuestion, type QuestionAnswerRow } from "@/lib/live"


export function valueText(row: QuestionAnswerRow, question?: ConsoleQuestion | null): string {
    const value = row.value
    if (!value) return "—"
    if (value.text !== undefined) return `“${value.text}”`
    if (value.oral) return "nói miệng"
    if (value.picked) {
        if (!question?.payload.options) return value.picked.join(", ")
        return value.picked
            .map((id) => {
                const index = question.payload.options!.findIndex((o) => o.id === id)
                return index >= 0 ? String.fromCharCode(65 + index) : id
            })
            .join(", ")
    }
    return "—"
}

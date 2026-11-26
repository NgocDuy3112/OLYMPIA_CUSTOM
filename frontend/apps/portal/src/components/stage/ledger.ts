import { type ConsoleQuestion, type QuestionAnswerRow } from "@/lib/live"


export function valueText(row: QuestionAnswerRow, question?: ConsoleQuestion | null): string {
    const value = row.value
    if (!value) return "—"
    if (value.text !== undefined) return value.text
    if (value.picked) {
        const payload = question?.payload
        if (!payload || !("options" in payload)) return value.picked.join(", ")
        const options = payload.options
        return value.picked
            .map((id) => {
                const index = options.findIndex((option) => option.id === id)
                if (index >= 0) return String.fromCharCode(65 + index)
                return id
            })
            .join(", ")
    }
    return "—"
}

import { Plus, X } from "lucide-react"
import { Button } from "@shared/ui/button"
import { Input } from "@shared/ui/input"
import { nextOptionId, type AuthorDraft, type PayloadShape } from "./payload-shape"

interface OptionsFieldProps {
    shape: PayloadShape
    options: AuthorDraft["options"]
    correct: string[]
    patch: (part: Partial<AuthorDraft>) => void
}

export function OptionsField({ shape, options, correct, patch }: OptionsFieldProps) {
    const setOptionText = (id: string, text: string) =>
        patch({
            options: options.map((o) => {
                if (o.id === id) return { ...o, text }
                return o
            }),
        })

    const addOption = () =>
        patch({ options: [...options, { id: nextOptionId(options.map((o) => o.id)), text: "" }] })

    const removeOption = (id: string) =>
        patch({
            options: options.filter((o) => o.id !== id),
            correct: correct.filter((cid) => cid !== id),
        })

    const toggleCorrect = (id: string) => {
        const included = correct.includes(id)
        if (shape === "choice") {
            if (included) {
                patch({ correct: [] })
            } else {
                patch({ correct: [id] })
            }
            return
        }
        if (included) {
            patch({ correct: correct.filter((cid) => cid !== id) })
        } else {
            patch({ correct: [...correct, id] })
        }
    }

    let optionsLabel = "Options · tick the correct one(s)"
    if (shape === "choice") optionsLabel = "Options — the audience face, pick exactly one correct"

    if (shape !== "choice") return null
    return (
        <div className="grid gap-2">
            <span className="text-sm font-medium">
                {optionsLabel}
            </span>
            {options.map((option, index) => {
                return (
                    <div key={option.id} className="flex items-center gap-2">
                        <input
                            type="radio"
                            name="oral-correct"
                            checked={correct.includes(option.id)}
                            onChange={() => toggleCorrect(option.id)}
                            aria-label={`Option ${String.fromCharCode(65 + index)} correct`}
                            className="size-4 shrink-0"
                        />
                        <span className="w-4 shrink-0 text-sm font-semibold text-muted-foreground">
                            {String.fromCharCode(65 + index)}
                        </span>
                        <Input
                            value={option.text}
                            onChange={(event) => setOptionText(option.id, event.target.value)}
                            placeholder={`Option ${String.fromCharCode(65 + index)}`}
                        />
                        <Button
                            variant="ghost"
                            size="sm"
                            disabled={options.length <= 2}
                            aria-label={`Remove option ${String.fromCharCode(65 + index)}`}
                            onClick={() => removeOption(option.id)}
                        >
                            <X className="size-4" />
                        </Button>
                    </div>
                )
            })}
            <Button
                variant="outline"
                size="sm"
                className="justify-start"
                aria-label="Thêm lựa chọn"
                title="Thêm lựa chọn"
                onClick={addOption}
            >
                <Plus className="size-4" />
            </Button>
        </div>
    )
}

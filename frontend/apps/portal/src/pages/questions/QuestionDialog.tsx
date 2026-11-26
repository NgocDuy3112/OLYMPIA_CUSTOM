import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@shared/lib/api"
import { QuestionAuthorDialog } from "@/components/question-author-dialog"
import type { AuthorSave } from "@/components/question-author-dialog"
import { errorMessage } from "@shared/lib/error-text"
import type { BankQuestion, Kind } from "./model"

export function QuestionDialog({
    row,
    presetKeywordId,
    bucket,
    open,
    onClose,
}: {
    row: BankQuestion | null
    presetKeywordId?: string
    bucket?: string
    open: boolean
    onClose: () => void
}) {
    const queryClient = useQueryClient()
    const [error, setError] = useState<string | null>(null)

    const save = useMutation({
        mutationFn: (input: AuthorSave) => {
            const kind: Kind = input.kind
            const body: Record<string, unknown> = {
                questionText: input.questionText,
                payload: input.payload,
                tags: input.tags,
                media: input.media,
            }
            if (input.keywordId) body.keywordId = input.keywordId
            if (row) {
                if (kind !== row.kind) body.kind = kind
                body.keywordId = input.keywordId
                return api(`/portal/questions/${row.id}`, {
                    method: "PATCH",
                    body: JSON.stringify(body),
                })
            }
            body.kind = kind
            return api("/portal/questions", { method: "POST", body: JSON.stringify(body) })
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ["questions"] })
            void queryClient.invalidateQueries({ queryKey: ["bucket-counts"] })
            void queryClient.invalidateQueries({ queryKey: ["keyword-hints"] })
            void queryClient.invalidateQueries({ queryKey: ["keyword-list"] })
            onClose()
        },
        onError: (cause) => setError(errorMessage(cause)),
    })

    return (
        <QuestionAuthorDialog
            open={open}
            row={row}
            bucket={bucket}
            presetKeywordId={presetKeywordId}
            busy={save.isPending}
            saveError={error}
            onCancel={onClose}
            onSave={(input) => save.mutate(input)}
        />
    )
}

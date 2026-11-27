import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Link2, Plus, Save, X } from "lucide-react"
import { api } from "@shared/lib/api"
import { Badge } from "@shared/ui/badge"
import { Button } from "@shared/ui/button"
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@shared/ui/dialog"
import { Input } from "@shared/ui/input"
import {
    BUCKET_GROUPS,
    BUCKET_VALUES,
    HINT_MAX,
    buildPayload,
    draftFrom,
    kindFor,
    nextOptionId,
    payloadShapeOf,
    reasonFor,
    stripBridge,
    type AuthorDraft,
    type AuthorRow,
    type AuthorSave,
} from "./question-author/payload-shape"
import { AudiencePreview } from "./question-author/AudiencePreview"
import { MediaField } from "./question-author/MediaField"

export type {
    AuthorDraft,
    AuthorRow,
    AuthorSave,
} from "./question-author/payload-shape"

export interface AuthorDialogProps {
    open: boolean
    row?: AuthorRow | null
    bucket?: string
    presetKeywordId?: string
    busy?: boolean
    saveError?: string | null
    onCancel: () => void
    onSave: (input: AuthorSave) => void | Promise<void>
}

export function QuestionAuthorDialog({
    open,
    row = null,
    bucket,
    presetKeywordId,
    busy = false,
    saveError = null,
    onCancel,
    onSave,
}: AuthorDialogProps) {
    const [draft, setDraft] = useState<AuthorDraft>(() => draftFrom(row, bucket, presetKeywordId))
    const [linking, setLinking] = useState(() => Boolean(presetKeywordId) || row?.keywordId != null)
    const hintBorn = Boolean(presetKeywordId) && row === null
    const hintMode = row?.keywordId != null || Boolean(presetKeywordId)

    const patch = (part: Partial<AuthorDraft>) => setDraft((prev) => ({ ...prev, ...part }))

    const shape = payloadShapeOf(draft.bucket, linking)
    const showLink = draft.bucket === "giai-ma" && (linking || hintMode)

    const keywordList = useQuery({
        queryKey: ["keyword-list"],
        queryFn: () =>
            api<{ items: Array<{ id: string; kind: string; questionText: string; status: string; payload: Record<string, unknown> }> }>(
                `/portal/questions?${new URLSearchParams({ kind: "KEYWORD", limit: "100", offset: "0" }).toString()}`
            ),
        enabled: showLink && open,
        staleTime: 15_000,
    })
    const hintPool = useQuery({
        queryKey: ["keyword-hints", draft.keywordId],
        queryFn: () =>
            api<{ items: Array<{ id: string }> }>(
                `/portal/questions?${new URLSearchParams({ kind: "TEXT", keywordId: draft.keywordId, limit: "100", offset: "0" }).toString()}`
            ),
        enabled: open && draft.keywordId.length > 0 && showLink,
        staleTime: 15_000,
    })
    const selfIsHint = row !== null && row.keywordId != null && row.keywordId === draft.keywordId
    let hintOffset = 0
    if (selfIsHint) hintOffset = 1
    const otherHints = Math.max(0, (hintPool.data?.items ?? []).length - hintOffset)
    const hintCapFull = draft.keywordId.length > 0 && otherHints >= HINT_MAX

    const keywordOptions = (keywordList.data?.items ?? []).filter(
        (keyword) => keyword.status !== "ARCHIVED" || keyword.id === draft.keywordId
    )

    const changeBucket = (next: string) => {
        if (next !== "giai-ma") {
            setLinking(false)
            patch({ bucket: next, keywordId: "" })
        } else {
            patch({ bucket: next })
        }
    }

    const setOptionText = (id: string, text: string) =>
        patch({
            options: draft.options.map((o) => {
                if (o.id === id) return { ...o, text }
                return o
            }),
        })

    const addOption = () =>
        patch({ options: [...draft.options, { id: nextOptionId(draft.options.map((o) => o.id)), text: "" }] })

    const removeOption = (id: string) =>
        patch({
            options: draft.options.filter((o) => o.id !== id),
            correct: draft.correct.filter((cid) => cid !== id),
        })

    const toggleCorrect = (id: string) => {
        const included = draft.correct.includes(id)
        if (shape === "choice") {
            if (included) {
                patch({ correct: [] })
            } else {
                patch({ correct: [id] })
            }
            return
        }
        if (included) {
            patch({ correct: draft.correct.filter((cid) => cid !== id) })
        } else {
            patch({ correct: [...draft.correct, id] })
        }
    }

    const builtPayload = buildPayload(shape, draft)

    const problem: string | null = (() => {
        if (!draft.bucket) return "Pick the round group this question lives in."
        if (!draft.questionText.trim()) return "The question needs its text."
        if (builtPayload === null) return reasonFor(shape)
        if (showLink) {
            if (!draft.keywordId) return "Choose the keyword set this hint joins."
            if (hintCapFull) {
                return `This set already holds ${HINT_MAX}/${HINT_MAX} hints — convert or archive one first.`
            }
        }
        if (row) {
            const changed =
                draft.questionText.trim() !== row.questionText ||
                (draft.keywordId || null) !== (row.keywordId ?? null) ||
                JSON.stringify(stripBridge(builtPayload)) !==
                    JSON.stringify(stripBridge(row.payload ?? {})) ||
                JSON.stringify(draft.media ?? null) !==
                    JSON.stringify(row.media ?? null)
            if (!changed) return "No changes to save."
        }
        return null
    })()

    const save = () => {
        if (problem !== null || busy || builtPayload === null) return
        void onSave({
            kind: kindFor(shape, draft.keywordId),
            questionText: draft.questionText.trim(),
            keywordId: draft.keywordId || null,
            payload: builtPayload,
            tags: [...(row?.tags ?? []).filter((tag) => !BUCKET_VALUES.has(tag)), draft.bucket],
            media: draft.media,
        })
    }

    let dialogTitle = "New question"
    if (hintBorn) dialogTitle = "New hint"
    if (row) dialogTitle = "Edit question"

    let shapeHint = " — gõ câu trả lời"
    if (shape === "keyword") shapeHint = " — ô nhập bí mật cho Giải mã"
    if (shape === "choice") shapeHint = " — thí sinh trả lời miệng, khán giả chọn ô trả lời"
    let acceptedLabel = "Accepted answers (one per line)"
    if (shape === "choice") acceptedLabel = "Accepted answers — the judge's reference (one per line)"
    let optionsLabel = "Options · tick the correct one(s)"
    if (shape === "choice") optionsLabel = "Options — the audience face, pick exactly one correct"
    let hintCapCls = "text-muted-foreground"
    if (hintCapFull) hintCapCls = "text-destructive"
    let capNote = ""
    if (hintCapFull) capNote = " — convert or archive one first."

    return (
        <Dialog open={open} onOpenChange={(next) => { if (!next) onCancel() }}>
            <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>{dialogTitle}</DialogTitle>
                </DialogHeader>

                <div className="grid gap-4">
                    {
}
                    <div className="grid gap-4 sm:grid-cols-[1fr_11rem]">
                        <div className="grid gap-2">
                            <label className="text-sm font-medium" htmlFor="q-bucket">Round group</label>
                            <select
                                id="q-bucket"
                                value={draft.bucket}
                                onChange={(event) => changeBucket(event.target.value)}
                                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
                            >
                                <option value="">— pick a group —</option>
                                {BUCKET_GROUPS.map((group) => (
                                    <optgroup key={group.group} label={group.group}>
                                        {group.choices.map((choice) => (
                                            <option key={choice.value} value={choice.value}>
                                                {choice.label}
                                            </option>
                                        ))}
                                    </optgroup>
                                ))}
                            </select>
                            {draft.bucket && (
                                <p className="text-xs text-muted-foreground">{shapeHint}</p>
                            )}
                        </div>

                    </div>

                    <div className="grid gap-2">
                        <label className="text-sm font-medium" htmlFor="q-text">Question</label>
                        <textarea
                            id="q-text"
                            value={draft.questionText}
                            onChange={(event) => patch({ questionText: event.target.value })}
                            rows={3}
                            className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm"
                        />
                    </div>

                    {shape !== "keyword" && (
                        <div className="grid gap-2">
                            <label className="text-sm font-medium" htmlFor="q-accepted">
                                {acceptedLabel}
                            </label>
                            <textarea
                                id="q-accepted"
                                value={draft.accepted}
                                onChange={(event) => patch({ accepted: event.target.value })}
                                rows={2}
                                placeholder="Hà Nội"
                                className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm"
                            />
                        </div>
                    )}

                    {shape === "choice" && (
                        <div className="grid gap-2">
                            <span className="text-sm font-medium">
                                {optionsLabel}
                            </span>
                            {draft.options.map((option, index) => {
                                return (
                                    <div key={option.id} className="flex items-center gap-2">
                                        <input
                                            type="radio"
                                            name="oral-correct"
                                            checked={draft.correct.includes(option.id)}
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
                                            disabled={draft.options.length <= 2}
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
                    )}

                    {shape === "keyword" && (
                        <div className="grid gap-2">
                            <label className="text-sm font-medium" htmlFor="q-code">Keyword code</label>
                            <Input
                                id="q-code"
                                value={draft.code}
                                onChange={(event) => patch({ code: event.target.value })}
                                placeholder="the secret keyword"
                            />
                            <p className="text-xs text-muted-foreground">
                                Players type this keyword into the Giải Mã box; the prompt above is what they see.
                            </p>
                        </div>
                    )}

                    {showLink && (
                        <div className="grid gap-1 border-t pt-2">
                            <label className="text-sm font-medium" htmlFor="q-set">
                                Set · the keyword this hint joins
                            </label>
                            <select
                                id="q-set"
                                value={draft.keywordId}
                                onChange={(event) => {
                                    const value = event.target.value
                                    if (value) {
                                        patch({ keywordId: value })
                                    } else {
                                        setLinking(false)
                                        patch({ keywordId: "", bucket: "" })
                                    }
                                }}
                                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
                            >
                                <option value="">Not linked — pick another round group instead</option>
                                {keywordOptions.map((keyword) => (
                                    <option key={keyword.id} value={keyword.id}>
                                        {(keyword.payload as { code?: string }).code || keyword.questionText}
                                    </option>
                                ))}
                            </select>
                            {keywordList.data && keywordOptions.length === 0 && (
                                <span className="text-xs text-amber-600 dark:text-amber-500">
                                    No KEYWORD question exists yet — create the keyword first.
                                </span>
                            )}
                            {hintPool.data && draft.keywordId && (
                                <span className={"text-xs " + hintCapCls}>
                                    {otherHints}/{HINT_MAX} hints in this set
                                    {capNote}
                                </span>
                            )}
                        </div>
                    )}
                    {draft.bucket === "giai-ma" && !showLink && (
                        <Button
                            variant="outline"
                            size="sm"
                            className="justify-start"
                            aria-label="Gắn vào bộ từ khóa (hint)"
                            title="Gắn vào bộ từ khóa (hint)"
                            onClick={() => setLinking(true)}
                        >
                            <Link2 className="size-4" />
                        </Button>
                    )}

                    <div className="grid gap-2">
                        <span className="text-sm font-medium">Media (optional)</span>
                        <MediaField media={draft.media} onChange={(media) => patch({ media })} />
                    </div>

                    <AudiencePreview shape={shape} draft={draft} />

                    {saveError && (
                        <p role="alert" className="text-sm text-destructive">{saveError}</p>
                    )}
                </div>

                <DialogFooter className="items-center gap-2">
                    {problem !== null && (
                        <Badge variant="outline" className="mr-auto text-destructive">
                            {problem}
                        </Badge>
                    )}
                    <Button
                        variant="ghost"
                        aria-label="Cancel"
                        title="Cancel"
                        onClick={onCancel}
                        disabled={busy}
                    >
                        <X className="size-4" />
                    </Button>
                    <Button
                        aria-label="Save"
                        title="Save"
                        onClick={save}
                        disabled={problem !== null || busy}
                    >
                        <Save className="size-4" />
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

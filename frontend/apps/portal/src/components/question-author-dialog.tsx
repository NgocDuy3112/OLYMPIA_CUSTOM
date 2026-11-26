import { useState, type ReactNode } from "react"
import { useMutation, useQuery } from "@tanstack/react-query"
import { Link2, Plus, Save, Upload, X } from "lucide-react"
import { api } from "@shared/lib/api"
import { errorMessage } from "@shared/lib/error-text"
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

export type PayloadShape = "choice" | "keyword" | "text"
export type QuestionKind = "TEXT" | "KEYWORD"

export interface QuestionMedia {
    url: string
    type: "image" | "audio" | "video"
}

export interface AuthorDraft {
    bucket: string
    questionText: string
    accepted: string 
    options: Array<{ id: string; text: string }>
    correct: string[] 
    code: string
    keywordId: string 
    media: QuestionMedia | null
}

export interface AuthorSave {
    kind: QuestionKind
    questionText: string
    keywordId: string | null
    payload: Record<string, unknown>
    tags: string[]
    media: QuestionMedia | null
}

export interface AuthorRow {
    kind?: string 
    questionText: string
    keywordId?: string | null
    payload?: Record<string, unknown>
    tags?: string[]
    media?: QuestionMedia | null
}

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

const HINT_MAX = 8


interface BucketChoice {
    value: string
    label: string
}

const BUCKET_GROUPS: Array<{ group: string; choices: BucketChoice[] }> = [
    {
        group: "Khởi động",
        choices: [
            { value: "khoi-dong:rieng", label: "Riêng" },
            { value: "khoi-dong:chung", label: "Chung" },
        ],
    },
    { group: "Giải mã", choices: [{ value: "giai-ma", label: "Từ khóa" }] },
    { group: "Bứt phá", choices: [{ value: "but-pha", label: "Bứt phá" }] },
    {
        group: "Câu hỏi phụ",
        choices: [{ value: "cau-hoi-phu", label: "Câu hỏi phụ" }],
    },
    {
        group: "Về đích",
        choices: [
            { value: "ve-dich:20", label: "20 điểm" },
            { value: "ve-dich:30", label: "30 điểm" },
            { value: "ve-dich:40", label: "40 điểm" },
            { value: "ve-dich:50", label: "50 điểm" },
        ],
    },
]

const BUCKET_VALUES = new Set(BUCKET_GROUPS.flatMap((g) => g.choices.map((c) => c.value)))

function payloadShapeOf(bucket: string, linked: boolean): PayloadShape {
    if (linked) return "text" 
    switch (bucket) {
        case "khoi-dong:rieng":
        case "ve-dich:40":
        case "ve-dich:50":
            return "choice"
        case "giai-ma":
            return "keyword"
        default:
            return "text"
    }
}

function kindFor(shape: PayloadShape, keywordId: string): QuestionKind {
    if (keywordId) return "TEXT"
    if (shape === "keyword") return "KEYWORD"
    return "TEXT"
}


function nextOptionId(existing: string[]): string {
    for (let i = 0; i < 26; i += 1) {
        const id = String.fromCharCode(97 + i)
        if (!existing.includes(id)) return id
    }
    return `o${existing.length}`
}

function draftFrom(row: AuthorRow | null | undefined, bucket?: string, presetKeywordId?: string): AuthorDraft {
    const base: AuthorDraft = {
        bucket: bucket ?? "",
        questionText: row?.questionText ?? "",
        accepted: "",
        options: [
            { id: "a", text: "" },
            { id: "b", text: "" },
        ],
        correct: [],
        code: "",
        keywordId: row?.keywordId ?? presetKeywordId ?? "",
        media: row?.media ?? null,
    }
    if (!base.bucket && (presetKeywordId || row?.keywordId != null)) base.bucket = "giai-ma"
    if (!base.bucket && row) {
        let carried = (row.tags ?? []).find((tag) => BUCKET_VALUES.has(tag))
        if (carried === undefined) {
            const carrier = row.payload?.bucket
            if (typeof carrier === "string") {
                if (BUCKET_VALUES.has(carrier)) carried = carrier
            }
        }
        if (carried) base.bucket = carried
    }
    if (!row?.payload) return base
    const payload = row.payload
    if (Array.isArray(payload.options)) {
        base.options = (payload.options as Array<{ id: string; text: string }>).map((o) => ({
            id: o.id,
            text: o.text,
        }))
        base.correct = []
        if (Array.isArray(payload.correctSet)) base.correct = [...(payload.correctSet as string[])]
    }
    if (Array.isArray(payload.acceptedAnswers)) {
        base.accepted = (payload.acceptedAnswers as string[]).join("\n")
    }
    if (typeof payload.code === "string") base.code = payload.code
    return base
}

function buildPayload(shape: PayloadShape, draft: AuthorDraft): Record<string, unknown> | null {
    if (shape === "keyword") {
        if (!draft.code.trim()) return null
        return { code: draft.code.trim() }
    }
    const acceptedAnswers = draft.accepted
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
    if (acceptedAnswers.length === 0) return null
    if (shape === "text") return { acceptedAnswers }
    const options = draft.options
        .filter((o) => o.text.trim())
        .map((o) => ({ id: o.id, text: o.text.trim() }))
    if (options.length < 2) return null
    const ids = new Set(options.map((o) => o.id))
    const correct = draft.correct.filter((id) => ids.has(id))
    if (correct.length !== 1) return null
    return { acceptedAnswers, options, correctSet: correct }
}

function stripBridge(value: Record<string, unknown>): Record<string, unknown> {
    const rest = { ...value }
    delete rest.type
    delete rest.bucket
    return rest
}

function reasonFor(shape: PayloadShape): string {
    if (shape === "choice") {
        return "This group needs an answer line, at least 2 options and exactly one correct choice (the audience face)."
    }
    if (shape === "keyword") return "A keyword needs its code."
    return "This group needs at least one accepted answer (one per line)."
}


function AudiencePreview({ shape, draft }: { shape: PayloadShape; draft: AuthorDraft }) {
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

    const [uploadError, setUploadError] = useState<string | null>(null)

    const upload = useMutation({
        mutationFn: (file: File) => {
            const form = new FormData()
            form.append("file", file, file.name)
            return api<QuestionMedia>("/portal/questions/media", { method: "POST", body: form })
        },
        onSuccess: (media) => {
            setUploadError(null)
            patch({ media })
        },
        onError: (cause) => setUploadError(errorMessage(cause)),
    })

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
    let uploadLabel = "Tải ảnh / video / âm thanh"
    if (upload.isPending) uploadLabel = "Đang tải lên…"

    let mediaSlot: ReactNode = (
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-5 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-foreground">
            <Upload className="size-4" aria-hidden />
            <span>
                {uploadLabel}
            </span>
            <input
                type="file"
                accept="image/*,audio/*,video/*"
                className="sr-only"
                disabled={upload.isPending}
                onChange={(event) => {
                    const file = event.target.files?.[0]
                    if (file) upload.mutate(file)
                    event.target.value = ""
                }}
            />
        </label>
    )
    if (draft.media) {
        let mediaPreview: ReactNode = (
            <span className="flex size-14 shrink-0 items-center justify-center rounded-md border bg-muted text-xs text-muted-foreground">
                {draft.media.type}
            </span>
        )
        if (draft.media.type === "image") {
            mediaPreview = (
                <img
                    src={draft.media.url}
                    alt=""
                    className="size-14 shrink-0 rounded-md border object-cover"
                />
            )
        }
        mediaSlot = (
            <div className="flex items-center gap-3 rounded-lg border p-2">
                {mediaPreview}
                <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                    {draft.media.url}
                </span>
                <Button
                    variant="ghost"
                    size="sm"
                    aria-label="Gỡ media"
                    title="Gỡ media"
                    onClick={() => patch({ media: null })}
                >
                    <X className="size-4" aria-hidden />
                </Button>
            </div>
        )
    }

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
                        {mediaSlot}
                        {uploadError && (
                            <p role="alert" className="text-xs text-destructive">
                                {uploadError}
                            </p>
                        )}
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

import { useState } from "react"
import { useMutation, useQuery } from "@tanstack/react-query"
import { Link2, Plus, Save, Upload, X } from "lucide-react"
import { api, ApiError } from "@shared/lib/api"
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

export type QuestionType = "TEXT" | "ORAL" | "CHOICE" | "KEYWORD"

export interface QuestionMedia {
    url: string
    type: "image" | "audio" | "video"
}

export interface AuthorDraft {
    bucket: string
    questionText: string
    timeLimit: string 
    accepted: string 
    options: Array<{ id: string; text: string }>
    correct: string[] 
    code: string
    keywordId: string 
    media: QuestionMedia | null
}

export interface AuthorSave {
    type: QuestionType
    questionText: string
    timeLimit: number | null
    keywordId: string | null
    payload: Record<string, unknown>
    tags: string[]
    media: QuestionMedia | null
}

export interface AuthorRow {
    type?: string 
    kind?: string 
    questionText: string
    timeLimit?: number | null
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
    typeLabel: string
}

const BUCKET_GROUPS: Array<{ group: string; choices: BucketChoice[] }> = [
    {
        group: "Khởi động",
        choices: [
            { value: "khoi-dong:rieng", label: "Riêng", typeLabel: "ORAL · khán giả chọn" },
            { value: "khoi-dong:chung", label: "Chung", typeLabel: "TEXT" },
        ],
    },
    { group: "Giải mã", choices: [{ value: "giai-ma", label: "Từ khóa", typeLabel: "KEYWORD" }] },
    { group: "Bứt phá", choices: [{ value: "but-pha", label: "Bứt phá", typeLabel: "TEXT" }] },
    {
        group: "Về đích",
        choices: [
            { value: "ve-dich:20", label: "20 điểm", typeLabel: "TEXT" },
            { value: "ve-dich:30", label: "30 điểm", typeLabel: "TEXT" },
            { value: "ve-dich:40", label: "40 điểm", typeLabel: "ORAL · khán giả chọn" },
            { value: "ve-dich:50", label: "50 điểm", typeLabel: "ORAL · khán giả chọn" },
        ],
    },
]

const BUCKET_VALUES = new Set(BUCKET_GROUPS.flatMap((g) => g.choices.map((c) => c.value)))

function typeForBucket(bucket: string, linked: boolean): QuestionType {
    if (linked) return "TEXT" 
    switch (bucket) {
        case "khoi-dong:rieng":
        case "ve-dich:40":
        case "ve-dich:50":
            return "ORAL"
        case "giai-ma":
            return "KEYWORD"
        default:
            return "TEXT"
    }
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
        timeLimit: row?.timeLimit != null ? String(row.timeLimit) : "",
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
    if (!base.bucket && (presetKeywordId || row?.kind === "HINT")) base.bucket = "giai-ma"
    if (!base.bucket && row) {
        const carried =
            (row.tags ?? []).find((tag) => BUCKET_VALUES.has(tag)) ??
            (typeof row.payload?.bucket === "string" && BUCKET_VALUES.has(row.payload.bucket)
                ? row.payload.bucket
                : undefined)
        if (carried) base.bucket = carried
    }
    if (!row?.payload) return base
    const payload = row.payload
    if (Array.isArray(payload.options)) {
        base.options = (payload.options as Array<{ id: string; text: string }>).map((o) => ({
            id: o.id,
            text: o.text,
        }))
        base.correct = Array.isArray(payload.correctSet) ? [...(payload.correctSet as string[])] : []
    }
    if (Array.isArray(payload.acceptedAnswers)) {
        base.accepted = (payload.acceptedAnswers as string[]).join("\n")
    }
    if (typeof payload.code === "string") base.code = payload.code
    return base
}

function buildPayload(type: QuestionType, draft: AuthorDraft): Record<string, unknown> | null {
    // Answer matching lives server-side (trim + ignore case) — no normalize block.
    if (type === "TEXT" || type === "ORAL") {
        const acceptedAnswers = draft.accepted
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean)
        if (acceptedAnswers.length === 0) return null
        if (type === "TEXT") return { type, acceptedAnswers }
        const options = draft.options
            .filter((o) => o.text.trim())
            .map((o) => ({ id: o.id, text: o.text.trim() }))
        if (options.length < 2) return null
        const ids = new Set(options.map((o) => o.id))
        const correct = draft.correct.filter((id) => ids.has(id))
        if (correct.length !== 1) return null
        return { type, acceptedAnswers, options, correctSet: correct }
    }
    if (type === "CHOICE") {
        const options = draft.options
            .filter((o) => o.text.trim())
            .map((o) => ({ id: o.id, text: o.text.trim() }))
        if (options.length === 0) return null
        const ids = new Set(options.map((o) => o.id))
        const correctSet = draft.correct.filter((id) => ids.has(id))
        if (correctSet.length === 0) return null
        return { type, options, correctSet }
    }
    if (!draft.code.trim()) return null
    return { type, code: draft.code.trim() }
}

function stripBridge(value: Record<string, unknown>): Record<string, unknown> {
    const rest = { ...value }
    delete rest.type
    delete rest.bucket
    return rest
}

function reasonFor(type: QuestionType): string {
    if (type === "ORAL") {
        return "ORAL needs an answer line, at least 2 options and exactly one correct choice (the audience face)."
    }
    if (type === "CHOICE") return "CHOICE needs at least one option with a ticked correct answer."
    if (type === "KEYWORD") return "KEYWORD needs its code."
    return "TEXT needs at least one accepted answer (one per line)."
}


function AudiencePreview({ type, draft }: { type: QuestionType; draft: AuthorDraft }) {
    const options = draft.options.filter((o) => o.text.trim())
    const showsChoice = options.length > 0 && (type === "ORAL" || type === "CHOICE")
    return (
        <div className="grid gap-2 rounded-lg border border-border bg-muted/40 p-3">
            <span className="text-xs font-medium text-muted-foreground">
                Khán giả thấy
                {showsChoice ? " — CHOICE" : " — ô nhập như thí sinh"}
            </span>
            {showsChoice ? (
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
            ) : (
                <div className="rounded-md border border-input bg-background px-2 py-1 text-xs text-muted-foreground">
                    Câu trả lời của bạn
                </div>
            )}
        </div>
    )
}


function messageOf(error: unknown): string {
    if (error instanceof ApiError) return error.message
    return "Không tải lên được tệp — thử lại."
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
    const [linking, setLinking] = useState(() => Boolean(presetKeywordId) || row?.kind === "HINT")
    const hintBorn = Boolean(presetKeywordId) && row === null
    const hintMode = row?.kind === "HINT" || Boolean(presetKeywordId)

    const patch = (part: Partial<AuthorDraft>) => setDraft((prev) => ({ ...prev, ...part }))

    const [uploadError, setUploadError] = useState<string | null>(null)

    // Uploaded the moment a file is picked, so the preview shows the real stored
    // object and the save only has to remember its { url, type }. Cancelling the
    // dialog after picking therefore leaves an orphan in the bucket — accepted.
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
        onError: (cause) => setUploadError(messageOf(cause)),
    })

    const type = typeForBucket(draft.bucket, linking)
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
                `/portal/questions?${new URLSearchParams({ kind: "HINT", keywordId: draft.keywordId, limit: "100", offset: "0" }).toString()}`
            ),
        enabled: open && draft.keywordId.length > 0 && showLink,
        staleTime: 15_000,
    })
    const selfIsHint = row !== null && row.kind === "HINT" && row.keywordId === draft.keywordId
    const otherHints = Math.max(0, (hintPool.data?.items ?? []).length - (selfIsHint ? 1 : 0))
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
        patch({ options: draft.options.map((o) => (o.id === id ? { ...o, text } : o)) })

    const addOption = () =>
        patch({ options: [...draft.options, { id: nextOptionId(draft.options.map((o) => o.id)), text: "" }] })

    const removeOption = (id: string) =>
        patch({
            options: draft.options.filter((o) => o.id !== id),
            correct: draft.correct.filter((cid) => cid !== id),
        })

    const toggleCorrect = (id: string) => {
        if (type === "ORAL") patch({ correct: draft.correct.includes(id) ? [] : [id] })
        else
            patch({
                correct: draft.correct.includes(id)
                    ? draft.correct.filter((cid) => cid !== id)
                    : [...draft.correct, id],
            })
    }

    const builtPayload = buildPayload(type, draft)

    const problem: string | null = (() => {
        if (!draft.bucket) return "Pick the round group this question lives in."
        if (!draft.questionText.trim()) return "The question needs its text."
        const limit = draft.timeLimit.trim()
        if (limit !== "" && (!/^\d+$/.test(limit) || Number(limit) < 1)) {
            return "Time limit must be a positive whole number of seconds."
        }
        if (builtPayload === null) return reasonFor(type)
        if (showLink) {
            if (!draft.keywordId) return "Choose the keyword set this hint joins."
            if (hintCapFull) {
                return `This set already holds ${HINT_MAX}/${HINT_MAX} hints — convert or archive one first.`
            }
        }
        if (row) {
            const changed =
                draft.questionText.trim() !== row.questionText ||
                (draft.timeLimit ? Number(draft.timeLimit) : null) !== (row.timeLimit ?? null) ||
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
            type,
            questionText: draft.questionText.trim(),
            timeLimit: draft.timeLimit ? Number(draft.timeLimit) : null,
            keywordId: draft.keywordId || null,
            payload: builtPayload,
            tags: [...(row?.tags ?? []).filter((tag) => !BUCKET_VALUES.has(tag)), draft.bucket],
            media: draft.media,
        })
    }

    return (
        <Dialog open={open} onOpenChange={(next) => { if (!next) onCancel() }}>
            <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>{row ? "Edit question" : hintBorn ? "New hint" : "New question"}</DialogTitle>
                </DialogHeader>

                <div className="grid gap-4">
                    {/* Round group and time limit share a row: both are short, and
                        stacked they push the dialog to three screens. */}
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
                                                {choice.label} · {choice.typeLabel}
                                            </option>
                                        ))}
                                    </optgroup>
                                ))}
                            </select>
                            {draft.bucket && (
                                <p className="text-xs text-muted-foreground">
                                    Dạng trả lời:{" "}
                                    <Badge variant="outline">{type}</Badge>
                                    {type === "ORAL"
                                        ? " — thí sinh trả lời miệng, khán giả chọn ô trả lời"
                                        : type === "KEYWORD"
                                          ? " — ô nhập bí mật cho Giải mã"
                                          : " — gõ câu trả lời"}
                                </p>
                            )}
                        </div>

                        <div className="grid gap-2">
                            <label className="text-sm font-medium" htmlFor="q-limit">Time limit (s, optional)</label>
                            <Input
                                id="q-limit"
                                type="number"
                                min={1}
                                value={draft.timeLimit}
                                onChange={(event) => patch({ timeLimit: event.target.value })}
                                placeholder="—"
                            />
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

                    
                    {(type === "TEXT" || type === "ORAL") && (
                        <div className="grid gap-2">
                            <label className="text-sm font-medium" htmlFor="q-accepted">
                                {type === "ORAL"
                                    ? "Accepted answers — the judge's reference (one per line)"
                                    : "Accepted answers (one per line)"}
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

                    {(type === "ORAL" || type === "CHOICE") && (
                        <div className="grid gap-2">
                            <span className="text-sm font-medium">
                                {type === "ORAL"
                                    ? "Options — the audience face, pick exactly one correct"
                                    : "Options · tick the correct one(s)"}
                            </span>
                            {draft.options.map((option, index) => (
                                <div key={option.id} className="flex items-center gap-2">
                                    <input
                                        type={type === "ORAL" ? "radio" : "checkbox"}
                                        name={type === "ORAL" ? "oral-correct" : undefined}
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
                                        disabled={type === "ORAL" && draft.options.length <= 2}
                                        aria-label={`Remove option ${String.fromCharCode(65 + index)}`}
                                        onClick={() => removeOption(option.id)}
                                    >
                                        <X className="size-4" />
                                    </Button>
                                </div>
                            ))}
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

                    {type === "KEYWORD" && (
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
                                <span className={"text-xs " + (hintCapFull ? "text-destructive" : "text-muted-foreground")}>
                                    {otherHints}/{HINT_MAX} hints in this set
                                    {hintCapFull ? " — convert or archive one first." : ""}
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
                        {draft.media ? (
                            <div className="flex items-center gap-3 rounded-lg border p-2">
                                {draft.media.type === "image" ? (
                                    <img
                                        src={draft.media.url}
                                        alt=""
                                        className="size-14 shrink-0 rounded-md border object-cover"
                                    />
                                ) : (
                                    <span className="flex size-14 shrink-0 items-center justify-center rounded-md border bg-muted text-xs text-muted-foreground">
                                        {draft.media.type}
                                    </span>
                                )}
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
                        ) : (
                            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-5 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-foreground">
                                <Upload className="size-4" aria-hidden />
                                <span>
                                    {upload.isPending ? "Đang tải lên…" : "Tải ảnh / video / âm thanh"}
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
                        )}
                        {uploadError && (
                            <p role="alert" className="text-xs text-destructive">
                                {uploadError}
                            </p>
                        )}
                    </div>

                    <AudiencePreview type={type} draft={draft} />

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

export default QuestionAuthorDialog

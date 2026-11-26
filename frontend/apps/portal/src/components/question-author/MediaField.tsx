import { useState, type ReactNode } from "react"
import { useMutation } from "@tanstack/react-query"
import { Upload, X } from "lucide-react"
import { api } from "@shared/lib/api"
import { errorMessage } from "@shared/lib/error-text"
import { Button } from "@shared/ui/button"
import type { QuestionMedia } from "./payload-shape"

export function MediaField({ media, onChange }: {
    media: QuestionMedia | null
    onChange: (media: QuestionMedia | null) => void
}) {
    const [uploadError, setUploadError] = useState<string | null>(null)

    const upload = useMutation({
        mutationFn: (file: File) => {
            const form = new FormData()
            form.append("file", file, file.name)
            return api<QuestionMedia>("/portal/questions/media", { method: "POST", body: form })
        },
        onSuccess: (uploaded) => {
            setUploadError(null)
            onChange(uploaded)
        },
        onError: (cause) => setUploadError(errorMessage(cause)),
    })

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
    if (media) {
        let mediaPreview: ReactNode = (
            <span className="flex size-14 shrink-0 items-center justify-center rounded-md border bg-muted text-xs text-muted-foreground">
                {media.type}
            </span>
        )
        if (media.type === "image") {
            mediaPreview = (
                <img
                    src={media.url}
                    alt=""
                    className="size-14 shrink-0 rounded-md border object-cover"
                />
            )
        }
        mediaSlot = (
            <div className="flex items-center gap-3 rounded-lg border p-2">
                {mediaPreview}
                <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                    {media.url}
                </span>
                <Button
                    variant="ghost"
                    size="sm"
                    aria-label="Gỡ media"
                    title="Gỡ media"
                    onClick={() => onChange(null)}
                >
                    <X className="size-4" aria-hidden />
                </Button>
            </div>
        )
    }

    return (
        <>
            {mediaSlot}
            {uploadError && (
                <p role="alert" className="text-xs text-destructive">
                    {uploadError}
                </p>
            )}
        </>
    )
}

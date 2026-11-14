import { Volume2 } from "lucide-react"
import { enableSfx, useSfxBlocked } from "@shared/lib/sfx"
import { buttonVariants } from "@shared/ui/button"
import { cn } from "cn"

/**
 * The one-tap toll booth: shows up only after the browser has actually refused
 * a cue, and one tap pays the autoplay toll for every sound after it. Nothing
 * renders otherwise — the show is silent and automatic.
 */
export function SfxUnlockBar() {
    const blocked = useSfxBlocked()
    if (!blocked) return null

    return (
        <div className="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
            <button
                type="button"
                onClick={enableSfx}
                className={cn(buttonVariants(), "h-9 gap-2 shadow-lg")}
            >
                <Volume2 className="size-4" />
                Trình duyệt đang chặn âm thanh — Chạm để bật
            </button>
        </div>
    )
}

import { useEffect, useState } from "react"

const REVERT_MS = 1_500

/**
 * Copy a secret once and say so for a moment. The label reverts on its own, so
 * a second click is never needed and the confirmation cannot go stale.
 */
export function useCopyFeedback() {
    const [copied, setCopied] = useState(false)

    useEffect(() => {
        if (!copied) return
        const timer = window.setTimeout(() => setCopied(false), REVERT_MS)
        return () => window.clearTimeout(timer)
    }, [copied])

    const copy = (text: string) => {
        void navigator.clipboard.writeText(text)
        setCopied(true)
    }

    return { copied, copy }
}

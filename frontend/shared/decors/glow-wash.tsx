import { useEffect, useState } from "react"

/**
 * The room's light. Everything visual is in `shared/styles/stage.css`; this
 * component only stacks the layers and replays the "lights come up" sweep
 * whenever the round changes.
 */
export function GlowWash() {
    const [glow, setGlow] = useState<string>("")

    useEffect(() => {
        const read = () => setGlow(document.documentElement.dataset.glow ?? "")
        read()
        const observer = new MutationObserver(read)
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-glow"] })
        return () => observer.disconnect()
    }, [])

    return (
        <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
            {/* `key` restarts the sweep: a new round brings the lights up again. */}
            <div key={glow} className="stage-wash-in absolute inset-0">
                <div className="stage-wash absolute inset-0" />
                <div className="stage-vignette absolute inset-0" />
            </div>
            <div className="stage-grain absolute inset-0" />
        </div>
    )
}

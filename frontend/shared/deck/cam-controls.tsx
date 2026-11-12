import { Camera, CameraOff, Mic, MicOff, Volume2, VolumeX } from "lucide-react"
import { useSelfCam } from "@shared/lib/rtc"

const TONE = {
    neutral: "bg-black/55 text-white ring-white/30 backdrop-blur-[1px] hover:bg-black/70",
    off: "bg-destructive text-white ring-white/40 hover:brightness-110",
} as const

const btnCls = (tone: keyof typeof TONE): string =>
    `flex size-[1.7cqw] shrink-0 items-center justify-center rounded-[0.45cqw] ring-1 transition disabled:opacity-40 ${TONE[tone]}`

const ICON = "size-[1.05cqw]"

/**
 * The player's own controls, sitting ON their camera view: mic, camera, and
 * deafen (which unsubscribes every incoming stream). Must be placed inside a
 * `relative` tile — it paints over the bottom of the video.
 */
export function SelfCamControls() {
    const self = useSelfCam()
    if (!self) return null
    const ready = self.status === "connected"

    return (
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-[0.4cqw] rounded-b-lg bg-gradient-to-t from-black/65 via-black/35 to-transparent px-[0.4cqw] pb-[0.45cqw] pt-[1.2cqw]">
            <button
                type="button"
                onClick={self.toggleMic}
                disabled={!ready}
                aria-pressed={self.micOn}
                aria-label={self.micOn ? "Tắt mic" : "Bật mic"}
                title={self.micOn ? "Tắt mic" : "Bật mic"}
                className={btnCls(self.micOn ? "neutral" : "off")}
            >
                {self.micOn ? <Mic className={ICON} /> : <MicOff className={ICON} />}
            </button>
            <button
                type="button"
                onClick={self.toggleDeafen}
                aria-pressed={self.deafen}
                aria-label={self.deafen ? "Bật tiếng" : "Tắt tiếng"}
                title={self.deafen ? "Bật lại tiếng nghe" : "Tắt tiếng nghe"}
                className={btnCls(self.deafen ? "off" : "neutral")}
            >
                {self.deafen ? <VolumeX className={ICON} /> : <Volume2 className={ICON} />}
            </button>
            <button
                type="button"
                onClick={self.toggleCam}
                disabled={!ready}
                aria-pressed={self.camOn}
                aria-label={self.camOn ? "Tắt camera" : "Bật camera"}
                title={self.camOn ? "Tắt camera" : "Bật camera"}
                className={btnCls(self.camOn ? "neutral" : "off")}
            >
                {self.camOn ? <Camera className={ICON} /> : <CameraOff className={ICON} />}
            </button>
        </div>
    )
}

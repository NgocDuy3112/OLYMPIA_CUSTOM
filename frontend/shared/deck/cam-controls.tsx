import { Camera, CameraOff, Mic, MicOff, Volume2, VolumeX } from "lucide-react"
import { useSelfCam } from "@shared/lib/rtc"

const TONE = {
    neutral: "bg-black/55 text-white ring-white/30 backdrop-blur-[1px] hover:bg-black/70",
    off: "bg-destructive text-white ring-white/40 hover:brightness-110",
} as const

const btnCls = (tone: keyof typeof TONE): string =>
    `flex size-[1.7cqw] shrink-0 items-center justify-center rounded-[0.45cqw] ring-1 transition disabled:opacity-40 ${TONE[tone]}`

const ICON = "size-[1.05cqw]"

export function SelfCamControls() {
    const self = useSelfCam()
    if (!self) return null
    const ready = self.status === "connected"

    let MicIcon = MicOff
    let micLabel = "Bật mic"
    let micTone: keyof typeof TONE = "off"
    if (self.micOn) {
        MicIcon = Mic
        micLabel = "Tắt mic"
        micTone = "neutral"
    }

    let DeafenIcon = Volume2
    let deafenLabel = "Tắt tiếng"
    let deafenTitle = "Tắt tiếng nghe"
    let deafenTone: keyof typeof TONE = "neutral"
    if (self.deafen) {
        DeafenIcon = VolumeX
        deafenLabel = "Bật tiếng"
        deafenTitle = "Bật lại tiếng nghe"
        deafenTone = "off"
    }

    let CamIcon = CameraOff
    let camLabel = "Bật camera"
    let camTone: keyof typeof TONE = "off"
    if (self.camOn) {
        CamIcon = Camera
        camLabel = "Tắt camera"
        camTone = "neutral"
    }

    return (
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-[0.4cqw] rounded-b-lg bg-gradient-to-t from-black/65 via-black/35 to-transparent px-[0.4cqw] pb-[0.45cqw] pt-[1.2cqw]">
            <button
                type="button"
                onClick={self.toggleMic}
                disabled={!ready}
                aria-pressed={self.micOn}
                aria-label={micLabel}
                title={micLabel}
                className={btnCls(micTone)}
            >
                <MicIcon className={ICON} />
            </button>
            <button
                type="button"
                onClick={self.toggleDeafen}
                aria-pressed={self.deafen}
                aria-label={deafenLabel}
                title={deafenTitle}
                className={btnCls(deafenTone)}
            >
                <DeafenIcon className={ICON} />
            </button>
            <button
                type="button"
                onClick={self.toggleCam}
                disabled={!ready}
                aria-pressed={self.camOn}
                aria-label={camLabel}
                title={camLabel}
                className={btnCls(camTone)}
            >
                <CamIcon className={ICON} />
            </button>
        </div>
    )
}

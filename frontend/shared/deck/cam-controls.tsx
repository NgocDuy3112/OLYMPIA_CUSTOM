import { Camera, CameraOff, Mic, MicOff, Volume2, VolumeX } from "lucide-react"
import { useSelfCam } from "@shared/lib/rtc"

const TONE = {
    neutral: "bg-black/55 text-white ring-white/30 backdrop-blur-[1px]",
    off: "bg-destructive text-white ring-white/40",
} as const

const btnCls = (tone: keyof typeof TONE): string =>
    `flex size-[1.7cqw] shrink-0 items-center justify-center rounded-[0.45cqw] ring-1 ${TONE[tone]}`

const ICON = "size-[1.05cqw]"

export function SelfCamControls() {
    const self = useSelfCam()
    if (!self) return null

    let MicIcon = MicOff
    let micTone: keyof typeof TONE = "off"
    if (self.micOn) {
        MicIcon = Mic
        micTone = "neutral"
    }

    let DeafenIcon = Volume2
    let deafenTone: keyof typeof TONE = "neutral"
    if (self.deafen) {
        DeafenIcon = VolumeX
        deafenTone = "off"
    }

    let CamIcon = CameraOff
    let camTone: keyof typeof TONE = "off"
    if (self.camOn) {
        CamIcon = Camera
        camTone = "neutral"
    }

    return (
        <div
            role="status"
            aria-label="Trạng thái thiết bị do người điều hành quản lý"
            className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-[0.4cqw] rounded-b-lg bg-gradient-to-t from-black/65 via-black/35 to-transparent px-[0.4cqw] pb-[0.45cqw] pt-[1.2cqw]"
        >
            <span aria-label={self.micOn ? "Mic đang bật" : "Mic đang tắt"} className={btnCls(micTone)}>
                <MicIcon className={ICON} />
            </span>
            <span aria-label={self.deafen ? "Đang tắt tiếng nghe" : "Đang nghe"} className={btnCls(deafenTone)}>
                <DeafenIcon className={ICON} />
            </span>
            <span aria-label={self.camOn ? "Camera đang bật" : "Camera đang tắt"} className={btnCls(camTone)}>
                <CamIcon className={ICON} />
            </span>
        </div>
    )
}

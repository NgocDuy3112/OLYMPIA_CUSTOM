import { Camera, CameraOff, Mic, MicOff, Volume2, VolumeX } from "lucide-react"
import type { MouseEvent } from "react"

const TONE = {
    neutral: "bg-black/55 text-white ring-white/30 backdrop-blur-[1px] hover:bg-black/70",
    off: "bg-destructive text-white ring-white/40 hover:brightness-110",
} as const

const btnCls = (tone: keyof typeof TONE): string =>
    `flex size-[1.7cqw] shrink-0 items-center justify-center rounded-[0.45cqw] ring-1 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40 ${TONE[tone]}`

const ICON = "size-[1.05cqw]"

export interface PlayerCamControlsProps {
    playerId: string
    micOn?: boolean
    audioMuted?: boolean
    videoOff?: boolean
    onToggleMic?: () => void
    onToggleAudio?: () => void
    onToggleVideo?: () => void
}

export function PlayerCamControls({
    playerId,
    micOn,
    audioMuted,
    videoOff,
    onToggleMic,
    onToggleAudio,
    onToggleVideo,
}: PlayerCamControlsProps) {
    let MicIcon = MicOff
    let micLabel = "Bật mic"
    let micTitle = "Bật tiếng người chơi"
    let micTone: keyof typeof TONE = "off"
    if (micOn) {
        MicIcon = Mic
        micLabel = "Tắt mic"
        micTitle = "Tắt tiếng người chơi"
        micTone = "neutral"
    }

    let AudioIcon = Volume2
    let audioLabel = "Tắt tiếng"
    let audioTitle = "Tắt tiếng người chơi"
    let audioTone: keyof typeof TONE = "neutral"
    if (audioMuted) {
        AudioIcon = VolumeX
        audioLabel = "Bật tiếng"
        audioTitle = "Bật tiếng người chơi"
        audioTone = "off"
    }

    let CamIcon = Camera
    let camLabel = "Tắt camera"
    let camTitle = "Tắt xem camera người chơi"
    let camTone: keyof typeof TONE = "neutral"
    if (videoOff) {
        CamIcon = CameraOff
        camLabel = "Bật camera"
        camTitle = "Bật xem camera người chơi"
        camTone = "off"
    }

    const stop = (handle?: () => void) => (event: MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation()
        if (handle) handle()
    }

    return (
        <div
            role="group"
            aria-label={`Điều khiển thiết bị của người chơi ${playerId}`}
            onClick={(event) => event.stopPropagation()}
            className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-[0.4cqw] rounded-b-lg bg-gradient-to-t from-black/65 via-black/35 to-transparent px-[0.4cqw] pb-[0.45cqw] pt-[1.2cqw]"
        >
            <button
                type="button"
                onClick={stop(onToggleMic)}
                aria-pressed={Boolean(micOn)}
                aria-label={micLabel}
                title={micTitle}
                className={btnCls(micTone)}
            >
                <MicIcon className={ICON} />
            </button>
            <button
                type="button"
                onClick={stop(onToggleAudio)}
                aria-pressed={Boolean(audioMuted)}
                aria-label={audioLabel}
                title={audioTitle}
                className={btnCls(audioTone)}
            >
                <AudioIcon className={ICON} />
            </button>
            <button
                type="button"
                onClick={stop(onToggleVideo)}
                aria-pressed={Boolean(videoOff)}
                aria-label={camLabel}
                title={camTitle}
                className={btnCls(camTone)}
            >
                <CamIcon className={ICON} />
            </button>
        </div>
    )
}

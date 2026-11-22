import type { CSSProperties } from "react"
import {
    Anchor,
    Atom,
    Award,
    Banknote,
    Bell,
    Binary,
    BookMarked,
    BookOpen,
    Braces,
    Brain,
    BrainCircuit,
    Calculator,
    Camera,
    Clapperboard,
    Coins,
    Compass,
    Crown,
    Dna,
    Eye,
    Feather,
    Fingerprint,
    Flag,
    Flame,
    Gauge,
    Gavel,
    Gem,
    Globe,
    GraduationCap,
    Hash,
    Hourglass,
    KeyRound,
    Languages,
    Landmark,
    Library,
    Lightbulb,
    Map,
    Medal,
    Megaphone,
    Microscope,
    Music,
    Newspaper,
    Notebook,
    NotebookPen,
    Orbit,
    Palette,
    Pencil,
    PenTool,
    PencilRuler,
    Percent,
    Pi,
    Presentation,
    Puzzle,
    Quote,
    Rocket,
    Repeat2,
    Ruler,
    Scale,
    ScrollText,
    Shield,
    Shuffle,
    Sigma,
    Smile,
    Sparkles,
    Split,
    Star,
    Swords,
    Target,
    Telescope,
    ThumbsUp,
    Trophy,
    Zap,
    type LucideIcon,
} from "lucide-react"

const FIELD_ICONS: LucideIcon[] = [
    GraduationCap,
    Brain,
    Lightbulb,
    Microscope,
    Telescope,
    Atom,
    Dna,
    Sigma,
    Pi,
    Calculator,
    Compass,
    Ruler,
    PencilRuler,
    Scale,
    Gavel,
    Library,
    ScrollText,
    Feather,
    PenTool,
    Pencil,
    Palette,
    Music,
    Languages,
    Globe,
    Map,
    BookOpen,
    BookMarked,
    Newspaper,
    Notebook,
    NotebookPen,
    Presentation,
    Megaphone,
    Landmark,
    Banknote,
    Coins,
    Quote,
    Braces,
    Hash,
    Percent,
    BrainCircuit,
    Binary,
    Smile,
    ThumbsUp,
    Crown,
    Trophy,
    Medal,
    Star,
    Flag,
    Award,
    Gem,
    Target,
    Swords,
    Hourglass,
    KeyRound,
    Puzzle,
    Rocket,
    Flame,
    Zap,
    Shield,
    Bell,
    Orbit,
    Fingerprint,
    Eye,
    Gauge,
    Clapperboard,
    Camera,
    Anchor,
    Sparkles,
    Shuffle,
    Split,
    Repeat2,
]

const GRID_COLS = 12
const GRID_ROWS = 9
const GRID_TOTAL = GRID_COLS * GRID_ROWS

type FieldItem = { Icon: LucideIcon; style: CSSProperties; key: number }

function itemStyle(index: number): CSSProperties {
    const col = index % GRID_COLS
    const row = Math.floor(index / GRID_COLS) % GRID_ROWS
    const left = col * 8.33 + (((index * 17) % 40) / 10)
    const top = row * 11.1 + (((index * 29) % 50) / 10)
    const size = 14 + ((index * 7) % 11)
    const rotate = ((index * 47) % 60) - 30
    const duration = 9 + (index % 7) * 2.2
    const delay = -((index * 13) % 90) / 10
    const base = 0.07 + (index % 3) * 0.02
    const peak = 0.3 + (index % 4) * 0.04
    const flashWindow = index % 5 === 0
    const driftX = (((index * 31) % 96) - 48) * 0.55
    const driftY = (((index * 23) % 68) - 34) * 0.55
    const floatDuration = 7.5 + (index % 6) * 1.8
    const floatDelay = -((index * 19) % 80) / 10
    return {
        left: `${left}%`,
        top: `${top}%`,
        width: `${size}px`,
        height: `${size}px`,
        "--blink-duration": `${duration}s`,
        "--blink-delay": `${delay}s`,
        "--icon-rotate": `${rotate}deg`,
        "--icon-base": `${base}`,
        "--icon-peak": `${peak}`,
        "--icon-flash": flashWindow ? "1" : "0",
        "--icon-drift-x": `${driftX}px`,
        "--icon-drift-y": `${driftY}px`,
        "--float-duration": `${floatDuration}s`,
        "--float-delay": `${floatDelay}s`,

    } as CSSProperties
}

const FIELD_ITEMS: FieldItem[] = Array.from({ length: GRID_TOTAL }, (_, index) => {
    const Icon = FIELD_ICONS[index % FIELD_ICONS.length]
    return { Icon, style: itemStyle(index), key: index }
})

const FIELD_CSS = `
.stage-field-float {
  animation-name: stage-field-float;
  animation-timing-function: ease-in-out;
  animation-iteration-count: infinite;
  animation-duration: var(--float-duration);
  animation-delay: var(--float-delay);
}
.stage-field-icon {
  opacity: var(--icon-base);
  filter: drop-shadow(0 0 1px currentColor);
  animation-name: stage-field-flash;
  animation-timing-function: ease-in-out;
  animation-iteration-count: infinite;
  animation-duration: var(--blink-duration);
  animation-delay: var(--blink-delay);
}
@keyframes stage-field-float {
  0% { transform: translate(0, 0); }
  25% { transform: translate(var(--icon-drift-x), calc(var(--icon-drift-y) * -1)); }
  50% { transform: translate(0, 0); }
  75% { transform: translate(calc(var(--icon-drift-x) * -1), var(--icon-drift-y)); }
  100% { transform: translate(0, 0); }
}
@keyframes stage-field-flash {
  0% { opacity: var(--icon-base); filter: drop-shadow(0 0 1px currentColor); }
  48% { opacity: var(--icon-base); filter: drop-shadow(0 0 1px currentColor); }
  52% {
    opacity: calc(var(--icon-base) + (var(--icon-peak) - var(--icon-base)) * var(--icon-flash));
    filter: drop-shadow(0 0 calc(2px + 2px * var(--icon-flash)) currentColor);
  }
  60% { opacity: var(--icon-base); filter: drop-shadow(0 0 1px currentColor); }
  100% { opacity: var(--icon-base); filter: drop-shadow(0 0 1px currentColor); }
}
`

export function IconField() {
    return (
        <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
            <style>{FIELD_CSS}</style>
            {FIELD_ITEMS.map(({ Icon, style, key }) => (
                <span key={key} style={style} className="stage-field-float absolute block">
                    <Icon className="stage-field-icon size-full text-[color:var(--glow-ink)]" />
                </span>
            ))}
        </div>
    )
}

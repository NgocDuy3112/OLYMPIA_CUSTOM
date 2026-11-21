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
    const duration = 3.2 + (index % 5) * 0.7
    const delay = -((index * 13) % 60) / 10
    const peak = 0.12 + (index % 5) * 0.04
    const driftX = ((index * 31) % 96) - 48
    const driftY = ((index * 23) % 68) - 34
    const floatDuration = 5 + (index % 6) * 1.4
    const floatDelay = -((index * 19) % 80) / 10
    return {
        left: `${left}%`,
        top: `${top}%`,
        width: `${size}px`,
        height: `${size}px`,
        "--blink-duration": `${duration}s`,
        "--blink-delay": `${delay}s`,
        "--icon-rotate": `${rotate}deg`,
        "--icon-peak": `${peak}`,
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
  opacity: 0;
  animation-name: stage-field-blink;
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
@keyframes stage-field-blink {
  0% { opacity: 0; transform: scale(0.75) rotate(var(--icon-rotate)); }
  50% { opacity: var(--icon-peak); transform: scale(1) rotate(var(--icon-rotate)); }
  100% { opacity: 0; transform: scale(1.2) rotate(var(--icon-rotate)); }
}
@media (prefers-reduced-motion: reduce) {
  .stage-field-float { animation: none; }
  .stage-field-icon { animation: none; opacity: var(--icon-peak); transform: rotate(var(--icon-rotate)); }
}
`

export function IconField() {
    return (
        <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
            <style>{FIELD_CSS}</style>
            {FIELD_ITEMS.map(({ Icon, style, key }) => (
                <span key={key} style={style} className="stage-field-float absolute block">
                    <Icon className="stage-field-icon size-full text-[color:var(--glow-ink)]" />
                </span>
            ))}
        </div>
    )
}

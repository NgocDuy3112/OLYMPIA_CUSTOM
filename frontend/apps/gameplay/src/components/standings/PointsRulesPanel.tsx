import { Medal } from "lucide-react"
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@shared/ui/card"
import type { PlacementTier } from "@/lib/api"
import { pointsForPlacement } from "@/lib/rankingPoints"

interface PointsRulesPanelProps {
    tiers: PlacementTier[]
}

export function PointsRulesPanel({ tiers }: PointsRulesPanelProps) {
    // No scale, no rules: a tournament with no tiers awards nothing.
    if (tiers.length === 0) return null

    const lastTier = tiers[tiers.length - 1]

    const rows = [
        ...tiers.map((tier) => ({
            label: tier.min === tier.max ? `${tier.min}` : `${tier.min}–${tier.max}`,
            points: tier.points,
        })),
        // A place outside the tiers is worth nothing — read from the same scale.
        { label: "còn lại", points: pointsForPlacement(tiers, lastTier.max + 1) },
    ]

    return (
        <Card className="h-fit [--card-spacing:--spacing(8)]">
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl">
                    <Medal className="size-4" aria-hidden />
                    Quy tắc tính điểm
                </CardTitle>
                <CardDescription>Dựa theo thứ hạng của mùa giải, các thí sinh sẽ tích luỹ được điểm số tương ứng</CardDescription>
            </CardHeader>
            <CardContent>
                <ul className="flex flex-col gap-1.5">
                    {rows.map((row) => (
                        <li
                            key={row.label}
                            className="flex items-center justify-between gap-3 rounded-md border border-border px-2 py-1.5 text-base"
                        >
                            <span className="text-muted-foreground">
                                Hạng {row.label}
                            </span>
                            <span className="font-semibold tabular-nums">
                                +{row.points}
                            </span>
                        </li>
                    ))}
                </ul>
            </CardContent>
        </Card>
    )
}

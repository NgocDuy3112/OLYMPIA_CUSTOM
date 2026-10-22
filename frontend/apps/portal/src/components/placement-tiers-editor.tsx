import { Button } from "@shared/ui/button"
import { Input } from "@shared/ui/input"
import { PLACEMENT_SCALES, type PlacementTier } from "@/lib/tournaments"


// The points for places: the bands, each a range of places and what they are worth.
// Shared by the tournament (the default for new seasons) and the season (its own).
export function PlacementTiersEditor({
    tiers,
    onChange,
    inheritFrom,
}: {
    tiers: PlacementTier[]
    onChange: (tiers: PlacementTier[]) => void
    inheritFrom?: PlacementTier[]
}) {
    const patch = (index: number, change: Partial<PlacementTier>) =>
        onChange(tiers.map((tier, i) => (i === index ? { ...tier, ...change } : tier)))

    const sameAsTournament = inheritFrom
        ? JSON.stringify(tiers) === JSON.stringify(inheritFrom)
        : false

    return (
        <div className="flex flex-col gap-2">
            {tiers.map((tier, index) => (
                <div key={index} className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Place</span>
                    <Input
                        aria-label="From place"
                        type="number"
                        className="h-8 w-16"
                        value={tier.min}
                        onChange={(event) =>
                            patch(index, { min: Number(event.target.value) })
                        }
                    />
                    <span className="text-xs text-muted-foreground">to</span>
                    <Input
                        aria-label="To place"
                        type="number"
                        className="h-8 w-16"
                        value={tier.max}
                        onChange={(event) =>
                            patch(index, { max: Number(event.target.value) })
                        }
                    />
                    <span className="text-xs text-muted-foreground">points</span>
                    <Input
                        aria-label="Points"
                        type="number"
                        className="h-8 w-16"
                        value={tier.points}
                        onChange={(event) =>
                            patch(index, { points: Number(event.target.value) })
                        }
                    />
                    <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => onChange(tiers.filter((_, i) => i !== index))}
                    >
                        Remove
                    </Button>
                </div>
            ))}

            <div className="flex flex-wrap gap-2">
                <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => onChange([...tiers, { min: 1, max: 1, points: 0 }])}
                >
                    Add a band
                </Button>

                {PLACEMENT_SCALES.map((scale) => (
                    <Button
                        key={scale.id}
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => onChange(scale.tiers.map((tier) => ({ ...tier })))}
                    >
                        Use {scale.title}
                    </Button>
                ))}

                {inheritFrom && !sameAsTournament && (
                    <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => onChange(inheritFrom.map((tier) => ({ ...tier })))}
                    >
                        Same as the tournament
                    </Button>
                )}

                {tiers.length > 0 && (
                    <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => onChange([])}
                    >
                        No points
                    </Button>
                )}
            </div>
        </div>
    )
}

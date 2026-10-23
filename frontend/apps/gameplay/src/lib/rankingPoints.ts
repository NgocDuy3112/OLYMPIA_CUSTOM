import type { PlacementTier } from "@/lib/api"


export function pointsForPlacement(tiers: PlacementTier[], place: number): number {
    return tiers.find((t) => place >= t.min && place <= t.max)?.points ?? 0
}

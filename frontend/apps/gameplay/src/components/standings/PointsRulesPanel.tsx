import { Medal } from "lucide-react"
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card"
import { PLACEMENT_TIERS, pointsForPlacement } from "@/lib/rankingPoints"

export function PointsRulesPanel() {
    const lastTier = PLACEMENT_TIERS[PLACEMENT_TIERS.length - 1]
    const outsidePoints = pointsForPlacement(lastTier.max + 1)

    const rows = [
        ...PLACEMENT_TIERS.map((tier) => ({
            label: tier.min === tier.max ? `${tier.min}` : `${tier.min}–${tier.max}`,
            points: tier.points,
        })),
        { label: "còn lại", points: outsidePoints },
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
                            className="flex items-center justify-between rounded-md px-2 py-1.5 text-base"
                        >
                            <span className="text-muted-foreground">
                                Hạng {row.label}
                            </span>
                            <span className="font-medium tabular-nums">
                                +{row.points}
                            </span>
                        </li>
                    ))}
                </ul>
                <div className="mt-3 border-t pt-3 text-sm text-muted-foreground">
                    <ul className="flex list-disc flex-col gap-1 pl-4">
                        <li>
                            Điểm xét duyệt cho mùa giải sau bằng tổng điểm tích luỹ tại mùa
                            giải hiện tại cộng 50% điểm tích luỹ tại mùa giải liền trước.
                        </li>
                        <li>
                            Hai thí sinh (trừ các thí sinh vào đến trận chung kết tại mùa giải
                            hiện tại) có tổng điểm tích luỹ cao nhất sẽ có hai slots vào thẳng
                            Vòng bảng.
                        </li>
                    </ul>
                </div>
            </CardContent>
        </Card>
    )
}
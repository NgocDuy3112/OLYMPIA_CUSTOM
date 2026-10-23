import { CartesianGrid, LabelList, Line, LineChart, XAxis } from "recharts"
import type { LabelProps } from "recharts"
import {
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent,
    type ChartConfig,
} from "@shared/ui/chart"
import type { TournamentRound } from "@/lib/api"
import type { PlayerResult } from "@/lib/types"


interface RoundChartProps {
    // The tournament's own rounds, in order — the chart's x-axis is this list.
    rounds: TournamentRound[]
    players: PlayerResult[]
}

export function RoundChart({ rounds, players }: RoundChartProps) {
    const withRounds = players.filter(
        (p) => p.roundScores !== undefined
    )

    // The round names the scores are keyed by, in the tournament's order.
    const roundNames = rounds.map((r) => r.name)

    // Nothing to draw: nobody has scores yet, or the scores name no listed round.
    if (withRounds.length === 0 || roundNames.length === 0) {
        return (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-10 text-center">
                <p className="font-medium">Chưa có biểu đồ</p>
                <p className="text-sm text-muted-foreground">
                    Biểu đồ hiển thị sau khi các vòng thi bắt đầu.
                </p>
            </div>
        )
    }
    const OFFSET_Y = 7

    // A player who skipped a round scores 0 there — the line runs flat, not absent.
    const scoreOf = (p: PlayerResult, round: string) => p.roundScores?.[round] ?? 0

    const cum = withRounds.map((p) => {
        let acc = 0
        return roundNames.map((r) => (acc += scoreOf(p, r)))
    })

    // offsets[roundIndex][seriesIndex]
    const offsets: number[][] = roundNames.map((_, i) => {
        const buckets = new Map<number, number[]>()
        withRounds.forEach((_, pi) => {
            const v = cum[pi][i]
            const list = buckets.get(v) ?? []
            list.push(pi)
            buckets.set(v, list)
        })
        const out: number[] = []
        buckets.forEach((pis) => {
            pis.forEach((pi, k) => {
                out[pi] = (k - (pis.length - 1) / 2) * OFFSET_Y
            })
        })
        return out
    })

    const data = roundNames.map((round, i) => {
        const row: Record<string, string | number> = { round }
        withRounds.forEach((p, pi) => {
            row[p.id] = cum[pi][i] + offsets[i][pi]
        })
        return row
    })

    const config: ChartConfig = {
        round: { label: "Vòng" },
        ...Object.fromEntries(
            withRounds.map((p, pi) => [
                p.id,
                { label: p.name, color: `var(--chart-${pi + 1})` },
            ]),
        ),
    }

    const makeLabel =
        (name: string) =>
            ({ x, y, index }: LabelProps) => {
                if (index == null || index !== roundNames.length - 1) return null
                if (x == null || y == null) return null
                return (
                    <text
                        x={x}
                        y={y}
                        dx={8}
                        dy={4}
                        className="fill-foreground text-[11px] font-medium"
                    >
                        {name}
                    </text>
                )
            }

    return (
        <ChartContainer config={config} className="h-60 w-full">
            <LineChart
                data={data}
                margin={{ top: 8, left: 8, right: 104 }}
            >
                <CartesianGrid vertical={false} strokeDasharray="4 4" className="stroke-border" />
                <XAxis
                    dataKey="round"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    tick={{ fontSize: 11 }}
                    interval={0}
                    padding={{ left: 20, right: 20 }}
                />
                <ChartTooltip
                    content={
                        <ChartTooltipContent
                            formatter={(value, name, item, index) => {
                                const round = (item.payload as { round?: string })?.round
                                const ri = roundNames.indexOf(round ?? "")
                                if (typeof value !== "number" || ri < 0) return value
                                return `${name} ${value - (offsets[ri]?.[index] ?? 0)}`
                            }}
                        />
                    }
                />
                {withRounds.map((p) => (
                    <Line
                        key={p.id}
                        dataKey={p.id}
                        type="monotone"
                        stroke={`var(--color-${p.id})`}
                        strokeWidth={2.5}
                        dot={{ r: 3 }}
                        activeDot={{ r: 5 }}
                    >
                        <LabelList content={makeLabel(p.name)} position="right" />
                    </Line>
                ))}
            </LineChart>
        </ChartContainer>
    )
}

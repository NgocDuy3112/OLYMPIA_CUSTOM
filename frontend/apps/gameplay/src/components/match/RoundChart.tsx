import { CartesianGrid, Legend, Line, LineChart, XAxis } from "recharts"
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

// Cumulative points per round — the TRUE values. (The old version nudged tied
// points apart with fake offsets so endpoint labels would not collide; near
// values still overlapped and the lines were not drawn where they scored.
// 2510: honest lines, and the names live in a right-side legend where they
// physically cannot collide.)
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

    // A player who skipped a round scores 0 there — the line runs flat, not absent.
    const scoreOf = (p: PlayerResult, round: string) => p.roundScores?.[round] ?? 0

    const data = roundNames.map((round, i) => {
        const row: Record<string, string | number> = { round }
        withRounds.forEach((p) => {
            let acc = 0
            for (let k = 0; k <= i; k++) acc += scoreOf(p, roundNames[k])
            row[p.id] = acc
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

    return (
        <ChartContainer config={config} className="h-60 w-full">
            <LineChart
                data={data}
                margin={{ top: 8, left: 8, right: 8 }}
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
                <Legend
                    layout="vertical"
                    align="right"
                    verticalAlign="middle"
                    iconType="line"
                    iconSize={10}
                    wrapperStyle={{ fontSize: 12, color: "var(--foreground)" }}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                {withRounds.map((p) => (
                    <Line
                        key={p.id}
                        name={p.name}
                        dataKey={p.id}
                        type="monotone"
                        stroke={`var(--color-${p.id})`}
                        strokeWidth={2.5}
                        dot={{ r: 3 }}
                        activeDot={{ r: 5 }}
                    />
                ))}
            </LineChart>
        </ChartContainer>
    )
}

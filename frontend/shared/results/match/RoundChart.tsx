import { CartesianGrid, Line, LineChart, XAxis } from "recharts"
import {
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent,
    type ChartConfig,
} from "@shared/ui/chart"
import type { TournamentRound } from "@shared/results/api"
import type { PlayerResult } from "@shared/results/types"


interface RoundChartProps {
    rounds: TournamentRound[]
    players: PlayerResult[]
}


export function RoundChart({ rounds, players }: RoundChartProps) {
    const withRounds = players.filter(
        (p) => p.roundScores !== undefined
    )

    const roundNames = rounds.map((r) => r.name)

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
        <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-foreground">
                {withRounds.map((p, pi) => (
                    <span key={p.id} className="inline-flex items-center gap-1.5 whitespace-nowrap">
                        <span
                            className="h-0.5 w-4 rounded-full"
                            style={{ backgroundColor: `var(--chart-${pi + 1})` }}
                            aria-hidden
                        />
                        {p.name}
                    </span>
                ))}
            </div>

            <ChartContainer config={config} className="h-60 w-full">
                <LineChart
                    data={data}
                    margin={{ top: 8, left: 8, right: 8 }}
                >
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
                    <CartesianGrid vertical={false} strokeDasharray="4 4" className="stroke-border" />
                    <XAxis
                        dataKey="round"
                        tickLine={false}
                        axisLine={false}
                        tickMargin={10}
                        tick={{ fontSize: 12 }}
                        interval={0}
                        padding={{ left: 8, right: 8 }}
                    />
                    <ChartTooltip content={<ChartTooltipContent />} />
                </LineChart>
            </ChartContainer>
        </div>
    )
}

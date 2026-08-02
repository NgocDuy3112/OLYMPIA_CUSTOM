import type { PlayerStatus } from "@/types/player";

interface ChartPoint {
    question_code: string;
    points: number;
    cumulative_score: number;
}

type ChartData = Record<string, ChartPoint[]>;

const COLORS = ["#67E8F9", "#38BDF8", "#60A5FA", "#818CF8", "#A78BFA", "#BAE6FD"];

function labelFor(code: string) {
    if (code === "ADJUST" || code === "OC3_Q_ADMIN_ADJUST") return "ADJUST";
    const value = code.replace(/^OC3_Q_/, "");
    const parts = value.split("_");
    if (parts[0] === "KD" && parts.length >= 3) return `KĐ_${parts[1]}`;
    return value.replace("KD_C", "KĐC").replace("GM", "GM").replace("BP", "BP").replace("VD", "VĐ");
}

export default function ScoreChart({ players, chartData }: { players: PlayerStatus[]; chartData: ChartData }) {
    const codes = Object.keys(chartData);
    const labels = Array.from(new Set(codes.flatMap((code) => chartData[code].map((point) => point.question_code))));
    if (!codes.length || !labels.length) return null;
    const width = 900;
    const height = 320;
    const padding = { top: 24, right: 24, bottom: 52, left: 48 };
    const maxScore = Math.max(50, ...codes.flatMap((code) => chartData[code].map((point) => point.cumulative_score)));
    const x = (index: number) => padding.left + (index * (width - padding.left - padding.right)) / Math.max(1, labels.length - 1);
    const y = (score: number) => height - padding.bottom - (score * (height - padding.top - padding.bottom)) / maxScore;

    return (
        <section className="w-full max-w-7xl rounded-xl border-2 border-blue-600 bg-blue-950/70 p-4 shadow-xl">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-xl font-bold uppercase text-blue-200">Diễn biến điểm</h2>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                    {codes.map((code, index) => {
                        const player = players.find((item) => item.playerCode === code);
                        return <span key={code} className="flex items-center gap-1.5 text-blue-100"><i className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />{player?.playerName ?? code}</span>;
                    })}
                </div>
            </div>
            <div className="overflow-x-auto">
                <svg viewBox={`0 0 ${width} ${height}`} className="min-w-[680px] w-full" role="img" aria-label="Biểu đồ diễn biến điểm">
                    {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                        const value = Math.round(maxScore * ratio);
                        const lineY = y(value);
                        return <g key={ratio}><line x1={padding.left} x2={width - padding.right} y1={lineY} y2={lineY} stroke="rgba(148,163,184,.2)" /><text x={padding.left - 8} y={lineY + 4} textAnchor="end" fill="#94A3B8" fontSize="12">{value}</text></g>;
                    })}
                    {labels.map((code, index) => <text key={code} x={x(index)} y={height - 18} textAnchor="middle" fill="#BAE6FD" fontSize="11">{labelFor(code)}</text>)}
                    {codes.map((code, playerIndex) => {
                        const points = chartData[code];
                        const values = labels.map((label) => points.find((point) => point.question_code === label)?.cumulative_score ?? null);
                        const path = values.reduce((result, value, index) => value == null ? result : `${result}${result ? " L" : "M"}${x(index)} ${y(value)}`, "");
                        return <g key={code}><path d={path} fill="none" stroke={COLORS[playerIndex % COLORS.length]} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />{values.map((value, index) => value == null ? null : <circle key={`${code}-${index}`} cx={x(index)} cy={y(value)} r="5" fill={COLORS[playerIndex % COLORS.length]} stroke="#061226" strokeWidth="2"><title>{`${code} ${labels[index]}: ${value} điểm`}</title></circle>)}</g>;
                    })}
                </svg>
            </div>
        </section>
    );
}

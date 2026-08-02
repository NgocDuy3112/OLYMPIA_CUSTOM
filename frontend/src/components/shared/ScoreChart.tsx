import type { PlayerStatus } from "@/types/player";

interface ChartPoint {
    question_code: string;
    points: number;
    cumulative_score: number;
}

type ChartData = Record<string, ChartPoint[]>;

const COLORS = ["#67E8F9", "#38BDF8", "#60A5FA", "#818CF8", "#A78BFA", "#BAE6FD"];

function groupFor(code: string) {
    if (code === "ADJUST" || code === "OC3_Q_ADMIN_ADJUST") return "ĐIỀU CHỈNH";
    const value = code.replace(/^OC3_Q_/, "");
    if (value.startsWith("KD")) return "KĐ";
    if (value.startsWith("GM")) return "GM";
    if (value.startsWith("BP")) return "BP";
    if (value.startsWith("VD")) return "VĐ";
    return "KHÁC";
}

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
    const groupOrder = ["KĐ", "GM", "BP", "VĐ", "ĐIỀU CHỈNH"];
    labels.sort((left, right) => groupOrder.indexOf(groupFor(left)) - groupOrder.indexOf(groupFor(right)));
    if (!codes.length || !labels.length) return null;
    const width = 900;
    const height = 420;
    const padding = { top: 24, right: 24, bottom: 92, left: 48 };
    const scoreValues = codes.flatMap((code) => chartData[code].map((point) => point.cumulative_score));
    const minScore = Math.min(0, ...scoreValues);
    const maxScore = Math.max(0, ...scoreValues);
    const scoreRange = Math.max(1, maxScore - minScore);
    const groups = labels.reduce<{ name: string; start: number; end: number }[]>((result, code, index) => {
        const name = groupFor(code);
        const previous = result[result.length - 1];
        if (previous?.name === name) previous.end = index;
        else result.push({ name, start: index, end: index });
        return result;
    }, []);
    const chartLeft = padding.left + 24;
    const chartRight = width - padding.right - 24;
    const x = (index: number) => chartLeft + (index * (chartRight - chartLeft)) / Math.max(1, labels.length - 1);
    const y = (score: number) => padding.top + ((maxScore - score) * (height - padding.top - padding.bottom)) / scoreRange;

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
                    <line x1={padding.left} x2={padding.left} y1={padding.top} y2={height - padding.bottom} stroke="rgba(230,238,245,.55)" strokeWidth="1.5" />
                    {[maxScore, minScore].map((value) => {
                        const lineY = y(value);
                        return <g key={value}><line x1={padding.left} x2={width - padding.right} y1={lineY} y2={lineY} stroke="rgba(148,163,184,.25)" /><text x={padding.left - 8} y={lineY + 4} textAnchor="end" fill="#BAE6FD" fontSize="12">{value}</text></g>;
                    })}
                    <line x1={padding.left} x2={width - padding.right} y1={y(0)} y2={y(0)} stroke="#E6EEF5" strokeWidth="1.5" strokeDasharray="6 4" />
                    <text x={padding.left - 8} y={y(0) + 4} textAnchor="end" fill="#E6EEF5" fontSize="12">0</text>
                    {groups.map((group) => <g key={group.name}><text x={(x(group.start) + x(group.end)) / 2} y={height - 8} textAnchor="middle" fill="#E6EEF5" fontSize="12" fontWeight="700">{group.name}</text>{group.start > 0 ? <line x1={x(group.start) - 8} x2={x(group.start) - 8} y1={padding.top} y2={height - padding.bottom + 8} stroke="rgba(148,163,184,.35)" strokeDasharray="4 4" /> : null}</g>)}
                    {labels.map((code, index) => <g key={code}><line x1={x(index)} x2={x(index)} y1={padding.top} y2={height - padding.bottom} stroke="rgba(148,163,184,.16)" strokeDasharray="3 5" /><text x={x(index)} y={height - 42} textAnchor="end" transform={`rotate(-28 ${x(index)} ${height - 42})`} fill="#BAE6FD" fontSize="11">{labelFor(code)}</text></g>)}
                    {codes.map((code, playerIndex) => {
                        const points = chartData[code];
                        const values = labels.map((label) => points.find((point) => point.question_code === label)?.cumulative_score ?? null);
                        const path = values.reduce((result, value, index) => value == null ? result : `${result}${result ? " L" : "M"}${x(index)} ${y(value)}`, "");
                        return <g key={code}><path d={path} fill="none" stroke={COLORS[playerIndex % COLORS.length]} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />{values.map((value, index) => value == null ? null : <g key={`${code}-${index}`}><circle cx={x(index)} cy={y(value)} r="5" fill={COLORS[playerIndex % COLORS.length]} stroke="#061226" strokeWidth="2"><title>{`${code} ${labels[index]}: ${value} điểm`}</title></circle></g>)}</g>;
                    })}
                </svg>
            </div>
        </section>
    );
}

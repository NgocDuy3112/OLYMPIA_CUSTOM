import { useState } from "react";
import type { PlayerStatus } from "@/types/player";

interface ChartPoint {
    question_code: string;
    points: number;
    cumulative_score: number;
}

type ChartData = Record<string, ChartPoint[]>;

type HoveredPoint = { playerCode: string; index: number } | null;

const COLORS = ["#67E8F9", "#38BDF8", "#60A5FA", "#818CF8", "#A78BFA", "#BAE6FD"];

function groupFor(code: string) {
    if (code === "ADJUST" || code === "OC3_Q_ADMIN_ADJUST") return "ĐIỀU CHỈNH";
    if (code.startsWith("[Khởi động")) return "KĐ";
    if (code.startsWith("[Giải mã]")) return "GM";
    if (code.startsWith("[Bứt phá]")) return "BP";
    if (code.startsWith("[Về đích]")) return "VĐ";
    if (code.startsWith("KĐ")) return "KĐ";
    if (code.startsWith("GM")) return "GM";
    if (code.startsWith("BP")) return "BP";
    if (code.startsWith("VĐ")) return "VĐ";
    const value = code.replace(/^OC3_Q_/, "");
    if (value.startsWith("KD")) return "KĐ";
    if (value.startsWith("GM")) return "GM";
    if (value.startsWith("BP")) return "BP";
    if (value.startsWith("VD")) return "VĐ";
    return "KHÁC";
}

function roundName(code: string) {
    const group = groupFor(code);
    return group === "KĐ" ? "Khởi động" : group === "GM" ? "Giải mã" : group === "BP" ? "Bứt phá" : group === "VĐ" ? "Về đích" : "Điều chỉnh";
}

function labelFor(code: string) {
    if (code === "ADJUST" || code === "OC3_Q_ADMIN_ADJUST") return "ADJUST";
    if (/^(KĐ|GM|BP|VĐ)_/.test(code)) return code;
    const value = code.replace(/^OC3_Q_/, "");
    const parts = value.split("_");
    if (parts[0] === "KD" && parts.length >= 3) return parts[1] === "C" ? `KĐ_C_${parts[2]}` : `KĐ_${parts[1]}`;
    return value.replace("KD_C", "KĐC").replace("GM", "GM").replace("BP", "BP").replace("VD", "VĐ");
}

function tooltipLabelFor(code: string, points?: number) {
    const value = code.replace(/^OC3_Q_/, "").replace(/^KĐ_/, "KD_").replace(/^GM_/, "GM_").replace(/^BP_/, "BP_").replace(/^VĐ_/, "VD_");
    const parts = value.split("_");
    if (parts[0] === "KD") {
        const isCommon = parts[1] === "C";
        const questionNumber = isCommon ? parts[2] : parts[1];
        return `[${isCommon ? "Khởi động chung" : "Khởi động riêng"}] Câu ${questionNumber}`;
    }
    if (parts[0] === "GM") return parts[1] === "KEY" ? "[Giải mã] Từ khoá" : `[Giải mã] Gợi ý ${parts[1]}`;
    if (parts[0] === "BP") return `[Bứt phá] Câu ${parts[1]}`;
    if (parts[0] === "VD") {
        const subjects: Record<string, string> = {
            TTTK: "Toán học, tin học",
            TNSS: "Tự nhiên, sự sống",
            XHPL: "Xã hội, pháp luật",
            NTNV: "Nghệ thuật, nhân văn",
            VHTT: "Văn hoá, thể thao",
            KTTH: "Kiến thức tổng hợp",
        };
        const subjectKey = parts.slice(1, -1).join("_");
        const subject = subjects[subjectKey] ?? subjects[parts[1]] ?? parts.slice(1, -1).join(" ");
        const question = points === 20 || points === 30 || points === 40 || points === 50 ? `${points} điểm` : "1";
        return `[Về đích] ${subject} - Câu ${question}`;
    }
    return code;
}

export default function ScoreChart({ players, chartData, questionLabels = [] }: { players: PlayerStatus[]; chartData: ChartData; questionLabels?: string[] }) {
    const [hoveredPoint, setHoveredPoint] = useState<HoveredPoint>(null);
    const codes = Object.keys(chartData);
    const labels = Array.from(new Set([...questionLabels.map(labelFor), ...codes.flatMap((code) => chartData[code].map((point) => labelFor(point.question_code)))]));
    const groupOrder = ["KĐ", "GM", "BP", "VĐ", "ĐIỀU CHỈNH"];
    labels.sort((left, right) => {
        const groupDifference = groupOrder.indexOf(groupFor(left)) - groupOrder.indexOf(groupFor(right));
        if (groupDifference !== 0) return groupDifference;
        if (groupFor(left) === "GM" || groupFor(left) === "VĐ") return 0;
        const questionNumber = (label: string) => {
            if (label.includes("Từ khoá")) return Number.MAX_SAFE_INTEGER;
            const match = label.match(/(?:Câu|Gợi ý)\s+(\d+)/) ?? label.match(/_(\d+)$/);
            return match ? Number(match[1]) : 0;
        };
        return questionNumber(left) - questionNumber(right);
    });
    if (!codes.length || !labels.length) return null;
    const width = 760;
    const height = 360;
    const padding = { top: 20, right: 18, bottom: 70, left: 42 };
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
        <section className="w-full max-w-6xl rounded-xl border-2 border-blue-600 bg-blue-950/70 p-4 shadow-xl">
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
                    {groups.map((group, index) => <g key={group.name}><rect x={group.start === 0 ? padding.left : x(group.start) - 12} y={padding.top} width={(group.end === labels.length - 1 ? width - padding.right : x(group.end + 1) - 12) - (group.start === 0 ? padding.left : x(group.start) - 12)} height={height - padding.top - padding.bottom} fill={index % 2 === 0 ? "rgba(30, 64, 175, .08)" : "rgba(8, 145, 178, .08)"} /><text x={(x(group.start) + x(group.end)) / 2} y={height - 18} textAnchor="middle" fill="#E6EEF5" fontSize="12" fontWeight="700">{roundName(group.name)}</text>{group.start > 0 ? <line x1={x(group.start) - 12} x2={x(group.start) - 12} y1={padding.top} y2={height - padding.bottom + 8} stroke="rgba(103,232,249,.75)" strokeWidth="2" strokeDasharray="5 4" /> : null}</g>)}
                    {labels.map((code, index) => <g key={code}><line x1={x(index)} x2={x(index)} y1={padding.top} y2={height - padding.bottom} stroke="rgba(148,163,184,.16)" strokeDasharray="3 5" /></g>)}
                    {codes.map((code, playerIndex) => {
                        const points = chartData[code];
                        const pointDetails = labels.map((label) => points.find((point) => labelFor(point.question_code) === label));
                        let lastScore = 0;
                        const values = pointDetails.map((point) => {
                            if (point) lastScore = point.cumulative_score;
                            return lastScore;
                        });
                        const path = values.reduce((result, value, index) => value == null ? result : `${result}${result ? " L" : "M"}${x(index)} ${y(value)}`, "");
                        return <g key={code}><path d={path} fill="none" stroke={COLORS[playerIndex % COLORS.length]} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />{values.map((value, index) => value == null ? null : <g key={`${code}-${index}`}><circle cx={x(index)} cy={y(value)} r="7" fill="transparent" onMouseEnter={() => setHoveredPoint({ playerCode: code, index })} onMouseLeave={() => setHoveredPoint(null)} /><circle cx={x(index)} cy={y(value)} r="2.5" fill={COLORS[playerIndex % COLORS.length]} stroke="#061226" strokeWidth="1.5" /></g>)}</g>;
                    })}
                    {hoveredPoint ? (() => {
                        const rows = codes.map((code, playerIndex) => {
                            const points = chartData[code];
                            const detail = labels.slice(0, hoveredPoint.index + 1).map((label) => points.find((point) => labelFor(point.question_code) === label)).reverse().find(Boolean);
                            const current = points.find((point) => labelFor(point.question_code) === labels[hoveredPoint.index]);
                            return { code, playerIndex, detail, current, value: detail?.cumulative_score ?? 0 };
                        });
                        const active = rows.find((row) => row.code === hoveredPoint.playerCode);
                        if (!active?.detail) return null;
                        const hoveredLabel = labels[hoveredPoint.index];
                        const titleCode = questionLabels.find((code) => labelFor(code) === hoveredLabel)
                            ?? codes.flatMap((code) => chartData[code]).find((point) => labelFor(point.question_code) === hoveredLabel)?.question_code
                            ?? hoveredLabel;
                        const titlePoints = codes.flatMap((code) => chartData[code]).find((point) => labelFor(point.question_code) === hoveredLabel)?.points;
                        return <foreignObject style={{ overflow: "visible", zIndex: 100 }} x={Math.min(width - 230, Math.max(8, x(hoveredPoint.index) - 108))} y={Math.max(8, y(Math.max(...rows.map((row) => row.value))) - 112)} width="222" height="104" pointerEvents="none"><div className="rounded-lg border border-blue-300/60 bg-[#061226]/95 px-3 py-2 text-left text-xs text-blue-50 shadow-xl"><div className="mb-1 font-bold text-blue-100">{tooltipLabelFor(titleCode, titlePoints)}</div>{rows.map((row) => <div key={row.code} className="flex justify-between gap-3 leading-4"><span style={{ color: COLORS[row.playerIndex % COLORS.length] }}>{players.find((player) => player.playerCode === row.code)?.playerName ?? row.code}</span><span><b>{row.current?.points ?? 0}</b> · <b className="text-cyan-300">{row.value}</b></span></div>)}</div></foreignObject>;
                    })() : null}
                </svg>
            </div>
        </section>
    );
}

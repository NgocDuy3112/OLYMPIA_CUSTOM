import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Flag, Trophy } from "lucide-react";
import { API_BASE_URL } from "@/configs";
import { Button } from "@/components/ui/button";

interface BracketPlayer {
  userCode: string;
  userName: string;
  position: number | null;
}

interface BracketMatch {
  matchCode: string;
  matchName: string;
  matchStatus: string;
  matchLabel: string | null;
  scheduledAt: string | null;
  venue: string | null;
  phaseId: string | null;
  players: BracketPlayer[];
}

interface BracketPhase {
  id: string;
  phaseNumber: number;
  phaseName: string;
  phaseType: string;
}

interface BracketEdge {
  fromMatchCode: string;
  rank: number;
  toMatchCode: string;
}

function relBox(el: HTMLElement, container: HTMLElement) {
  let x = 0;
  let y = 0;
  let node: HTMLElement | null = el;
  while (node && node !== container) {
    x += node.offsetLeft;
    y += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
  }
  return { x, y, w: el.offsetWidth, h: el.offsetHeight };
}

function MatchBox({
  match,
  advanced,
  isFinal,
  register,
}: {
  match: BracketMatch;
  advanced: Set<string>;
  isFinal: boolean;
  register: (code: string, el: HTMLDivElement | null) => void;
}) {
  const players = [...(match.players ?? [])].sort(
    (a, b) => (a.position ?? 99) - (b.position ?? 99),
  );
  const done = match.matchStatus === "finished" || match.matchStatus === "completed";
  return (
    <div
      ref={(el) => register(match.matchCode, el)}
      className="w-60 shrink-0 rounded-lg bg-accent/50 border border-border overflow-hidden"
    >
      <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 border-b border-border bg-accent/25">
        <span className="text-[11px]  text-muted-foreground truncate">
          {match.matchLabel ?? match.matchCode}
        </span>
        <span className="flex items-center gap-1 shrink-0">
          {isFinal && done && <Trophy size={12} className="text-warning" />}
          <span
            className={`w-2 h-2 rounded-full ${
              done ? "bg-success" : match.matchStatus === "setup" ? "bg-muted-foreground" : "bg-warning"
            }`}
            title={match.matchStatus}
          />
        </span>
      </div>
      <div className="flex flex-col">
        {players.length === 0 && (
          <p className="px-2.5 py-2 text-xs text-muted-foreground/70 border-b border-dashed border-border">
            Chưa có thí sinh
          </p>
        )}
        {players.map((p) => {
          const up = advanced.has(p.userCode);
          return (
            <div
              key={p.userCode}
              className={`flex items-center gap-2 px-2.5 py-1.5 border-b border-border/50 last:border-0 ${
                up ? "bg-success/15" : ""
              }`}
            >
              <span
                className={`w-5 shrink-0 text-xs font-bold ${up ? "text-success" : "text-muted-foreground"}`}
              >
                {p.position ?? "–"}
              </span>
              <span className={`flex-1 min-w-0 text-sm truncate ${up ? "text-success font-semibold" : "text-foreground"}`}>
                {p.userName || p.userCode}
              </span>
              {up && <Flag size={11} className="shrink-0 text-success" />}
            </div>
          );
        })}
      </div>
      {(match.scheduledAt || match.venue) && (
        <div className="px-2.5 py-1 border-t border-border text-[11px] text-muted-foreground truncate">
          {match.scheduledAt
            ? new Date(match.scheduledAt).toLocaleString("vi-VN", {
                day: "2-digit",
                month: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              })
            : ""}
          {match.scheduledAt && match.venue ? " · " : ""}
          {match.venue ?? ""}
        </div>
      )}
    </div>
  );
}

export function TournamentBracket({ tournamentCode }: { tournamentCode: string }) {
  const [phases, setPhases] = useState<BracketPhase[]>([]);
  const [matches, setMatches] = useState<BracketMatch[]>([]);
  const [edges, setEdges] = useState<BracketEdge[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [paths, setPaths] = useState<string[]>([]);
  const [svgSize, setSvgSize] = useState({ w: 0, h: 0 });

  const innerRef = useRef<HTMLDivElement>(null);
  const boxRefs = useRef(new Map<string, HTMLDivElement>());

  const register = (code: string, el: HTMLDivElement | null) => {
    if (el) boxRefs.current.set(code, el);
    else boxRefs.current.delete(code);
  };

  const fetchBracket = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/tournaments/${tournamentCode}/bracket`, {
        credentials: "include",
      });
      const json = await res.json();
      if (res.ok && json.status === "success") {
        setPhases(json.data.phases ?? []);
        setMatches(json.data.matches ?? []);
        setEdges(json.data.edges ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [tournamentCode]);

  useEffect(() => {
    boxRefs.current.clear();
  }, [tournamentCode]);

  useEffect(() => {
    void fetchBracket();
  }, [fetchBracket]);

  const columns = useMemo(() => {
    const sortedPhases = [...phases].sort((a, b) => a.phaseNumber - b.phaseNumber);
    const cols: { key: string; title: string; items: BracketMatch[] }[] = sortedPhases.map((p) => ({
      key: p.id,
      title: p.phaseName,
      items: matches
        .filter((m) => m.phaseId === p.id)
        .sort((a, b) => String(a.matchLabel ?? a.matchCode).localeCompare(String(b.matchLabel ?? b.matchCode))),
    }));
    const unphased = matches.filter((m) => !m.phaseId || !sortedPhases.some((p) => p.id === m.phaseId));
    if (unphased.length > 0) cols.push({ key: "unphased", title: "Chưa xếp vòng", items: unphased });
    if (cols.length === 0 && matches.length > 0)
      cols.push({ key: "all", title: "Tất cả trận", items: matches });
    return cols;
  }, [phases, matches]);

  const advancedByMatch = useMemo(() => {
    const playersByCode = new Map(matches.map((m) => [m.matchCode, new Set(m.players.map((p) => p.userCode))]));
    const out = new Map<string, Set<string>>();
    for (const e of edges) {
      const downstream = playersByCode.get(e.toMatchCode);
      if (!downstream) continue;
      const set = out.get(e.fromMatchCode) ?? new Set<string>();
      const fromPlayers = playersByCode.get(e.fromMatchCode) ?? new Set<string>();
      downstream.forEach((u) => {
        if (fromPlayers.has(u)) set.add(u);
      });
      out.set(e.fromMatchCode, set);
    }
    return out;
  }, [matches, edges]);

  const finalCodes = useMemo(() => {
    const from = new Set(edges.map((e) => e.fromMatchCode));
    const to = new Set(edges.map((e) => e.toMatchCode));
    return new Set([...to].filter((c) => !from.has(c)));
  }, [edges]);

  useLayoutEffect(() => {
    const compute = () => {
      const inner = innerRef.current;
      if (!inner) return;
      const d: string[] = [];
      for (const e of edges) {
        const fromEl = boxRefs.current.get(e.fromMatchCode);
        const toEl = boxRefs.current.get(e.toMatchCode);
        if (!fromEl || !toEl) continue;
        const a = relBox(fromEl, inner);
        const b = relBox(toEl, inner);
        const x1 = a.x + a.w;
        const y1 = a.y + a.h / 2;
        const x2 = b.x;
        const y2 = b.y + b.h / 2;
        if (x2 <= x1 + 4) {
          d.push(`M ${x1} ${y1} L ${x2} ${y2}`);
        } else {
          const midX = (x1 + x2) / 2;
          d.push(`M ${x1} ${y1} H ${midX} V ${y2} H ${x2}`);
        }
      }
      setPaths(d);
      setSvgSize({ w: inner.scrollWidth, h: inner.scrollHeight });
    };
    compute();
    window.addEventListener("resize", compute);
    const ro = new ResizeObserver(compute);
    if (innerRef.current) ro.observe(innerRef.current);
    const t = setTimeout(compute, 300);
    return () => {
      window.removeEventListener("resize", compute);
      ro.disconnect();
      clearTimeout(t);
    };
  }, [edges, columns]);

  const handleGenerateNext = async () => {
    const maxPhase = phases.reduce((m, p) => Math.max(m, p.phaseNumber), 0);
    if (!confirm(`Sinh vòng tiếp theo (sau phase ${maxPhase}) từ kết quả hiện tại?`)) return;
    setGenerating(true);
    try {
      const res = await fetch(`${API_BASE_URL}/tournaments/${tournamentCode}/generate-next-round`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ currentPhase: maxPhase }),
      });
      const json = await res.json();
      if (!res.ok) alert(`Thất bại: ${json.message ?? "Lỗi"}`);
      else {
        await fetchBracket();
      }
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return <p className="text-muted-foreground text-sm py-8 text-center">Đang tải bracket…</p>;
  }

  if (matches.length === 0) {
    return (
      <div className="rounded-xl bg-accent/50 border border-border p-8 text-center">
        <Trophy size={24} className="mx-auto text-muted-foreground/70 mb-2" />
        <p className="text-muted-foreground text-sm">Giải chưa có trận nào — dùng template hoặc lên lịch ở tab Lịch thi đấu.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs text-muted-foreground">
          <span className="inline-block w-2 h-2 rounded-full bg-success mr-1" /> Đi tiếp
          <span className="inline-block w-2 h-2 rounded-full bg-warning ml-3 mr-1" /> Đang đấu
          <span className="inline-block w-2 h-2 rounded-full bg-muted-foreground ml-3 mr-1" /> Chưa đấu
        </p>
        <Button
          variant="default"
          onClick={() => void handleGenerateNext()}
          disabled={generating || phases.length === 0}
          className="disabled:opacity-50 text-xs font-medium"
          title="POST generate-next-round từ phase cuối"
        >
          {generating ? "Đang sinh…" : "Sinh vòng tiếp theo"}
        </Button>
      </div>

      <div className="overflow-x-auto rounded-xl bg-background/40 border border-border">
        <div ref={innerRef} className="relative flex gap-12 p-6 min-w-max">
          <svg
            className="absolute inset-0 pointer-events-none"
            width={svgSize.w}
            height={svgSize.h}
          >
            {paths.map((d, i) => (
              <path key={i} d={d} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth={2} />
            ))}
          </svg>
          {columns.map((col) => (
            <div key={col.key} className="flex flex-col w-60 shrink-0">
              <p className="self-center px-4 py-1.5 rounded bg-primary text-primary-foreground text-sm font-bold whitespace-nowrap mb-2">
                {col.title}
              </p>
              <div className="flex-1 flex flex-col justify-around gap-8 py-2">
                {col.items.map((m) => (
                  <MatchBox
                    key={m.matchCode}
                    match={m}
                    advanced={advancedByMatch.get(m.matchCode) ?? new Set()}
                    isFinal={finalCodes.has(m.matchCode)}
                    register={register}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default TournamentBracket;

import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useGameWebSocket } from "@/hooks/useGameWebSocket";

export type LiveRound =
  | "kdc"
  | "kdr"
  | "gm"
  | "bp"
  | "vdc_pick"
  | "vdc"
  | "vdr_pick"
  | "vdr"
  | "waiting";

interface RoundPath {
  controller: string;
  player: string;
  round?: string;
  label: string;
}

export const ROUND_PATHS: Record<LiveRound, RoundPath> = {
  kdc: { controller: "/operator/controller/kdc", player: "/player/kdc", round: "kdc", label: "KĐ chung" },
  kdr: { controller: "/operator/controller/kdr", player: "/player/kdr", round: "kdr", label: "KĐ riêng" },
  gm: { controller: "/operator/controller/gm", player: "/player/gm", round: "gm", label: "Giải mã" },
  bp: { controller: "/operator/controller/bp", player: "/player/bp", round: "bp", label: "Bứt phá" },
  vdc_pick: { controller: "/operator/controller/vdc/pick", player: "/player/vdc/pick", round: "vdc", label: "VĐ chọn câu" },
  vdc: { controller: "/operator/controller/vdc", player: "/player/vdc", round: "vdc", label: "Về đích chung" },
  vdr_pick: { controller: "/operator/controller/vdr/pick", player: "/player/vdr/pick", round: "vdr", label: "VĐR chọn câu" },
  vdr: { controller: "/operator/controller/vdr", player: "/player/vdr", round: "vdr", label: "Về đích riêng" },
  waiting: { controller: "/operator/controller/waiting", player: "/player/waiting", label: "Sảnh chờ" },
};

export const LIVE_ROUND_ORDER: LiveRound[] = [
  "kdc",
  "kdr",
  "gm",
  "bp",
  "vdc_pick",
  "vdc",
  "vdr_pick",
  "vdr",
];

export function currentRoundFromPath(pathname: string): LiveRound | null {
  if (pathname.includes("/vdc/pick")) return "vdc_pick";
  if (pathname.includes("/vdr/pick")) return "vdr_pick";
  for (const r of ["kdc", "kdr", "gm", "bp", "vdc", "vdr"] as const) {
    if (pathname.includes(`/${r}`)) return r;
  }
  if (pathname.includes("/waiting")) return "waiting";
  return null;
}

export function useRoundNavigator(matchCode?: string) {
  const navigate = useNavigate();
  const location = useLocation();
  const { sendMessage } = useGameWebSocket();

  const goTo = useCallback(
    async (target: LiveRound) => {
      const code = (matchCode ?? "").trim();
      if (!code) return;
      const p = ROUND_PATHS[target];
      if (p.round) {
        await sendMessage({ type: "round_start", round: p.round });
        await sendMessage({ type: "clear_question", user_code: "" });
      }
      await sendMessage({
        type: "navigate",
        user_code: "",
        path: `${p.player}/${code}`,
      });
      navigate(`${p.controller}/${code}`);
    },
    [matchCode, navigate, sendMessage],
  );

  const current = currentRoundFromPath(location.pathname);
  const idx =
    current && current !== "waiting" ? LIVE_ROUND_ORDER.indexOf(current) : -1;

  const next: LiveRound | null =
    idx === -1
      ? "kdc"
      : idx < LIVE_ROUND_ORDER.length - 1
        ? LIVE_ROUND_ORDER[idx + 1]
        : "waiting";
  const prev: LiveRound | null = idx > 0 ? LIVE_ROUND_ORDER[idx - 1] : null;

  const goNext = useCallback(() => {
    if (next) void goTo(next);
  }, [goTo, next]);
  const goPrev = useCallback(() => {
    if (prev) void goTo(prev);
  }, [goTo, prev]);

  return {
    current,
    next,
    nextShort: next ? ROUND_PATHS[next].label : null,
    prev,
    prevShort: prev ? ROUND_PATHS[prev].label : null,
    goNext,
    goPrev,
  };
}

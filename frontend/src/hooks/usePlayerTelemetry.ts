import { useEffect, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { PlayerStatus } from "@/types/player";
import type { WebSocketContextValue, WebSocketMessage } from "@/types/websocket";
import { unwrapWebSocketMessage } from "@/types/websocket";

interface PlayerTelemetryOptions {
  lastMessage: WebSocketMessage | null;
  sendMessage: WebSocketContextValue["sendMessage"];
  players: PlayerStatus[];
  setPlayers: Dispatch<SetStateAction<PlayerStatus[]>>;
  intervalMs?: number;
  enabled?: boolean;
}

interface PendingPing {
  sentAt: number;
  timeoutId: number;
}

const HEARTBEAT_TIMEOUT_MS = 25_000;
const OFFLINE_CHECK_INTERVAL_MS = 10_000;
const DEFAULT_LATENCY_INTERVAL_MS = 10_000;
const PONG_TIMEOUT_MS = 5_000;
const PLAYER_CHANGE_DEBOUNCE_MS = 500;

export function usePlayerTelemetry({
  lastMessage,
  sendMessage,
  players,
  setPlayers,
  intervalMs = DEFAULT_LATENCY_INTERVAL_MS,
  enabled = true,
}: PlayerTelemetryOptions): void {
  const lastSeenRef = useRef<Record<string, number>>({});
  const pendingRef = useRef<Map<string, PendingPing>>(new Map());
  const playersRef = useRef(players);
  const sendMessageRef = useRef(sendMessage);
  const tickRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    playersRef.current = players;
  }, [players]);

  useEffect(() => {
    sendMessageRef.current = sendMessage;
  }, [sendMessage]);

  useEffect(() => {
    const message = unwrapWebSocketMessage(lastMessage);
    if (!message) return;

    if (message.type === "player_online" || message.type === "player_heartbeat") {
      const code = String(message.user_code ?? "");
      if (!code) return;
      lastSeenRef.current[code] = Date.now();
      if (message.type === "player_heartbeat") {
        queueMicrotask(() => {
          setPlayers((previous) => {
            if (previous.some((player) => player.playerCode === code)) {
              return previous.map((player) =>
                player.playerCode === code ? { ...player, playerConnected: true } : player,
              );
            }
            return [...previous, {
              playerCode: code,
              playerName: "",
              playerScore: 0,
              playerConnected: true,
            }];
          });
        });
      }
      return;
    }

    if (message.type !== "pong_latency") return;
    const code = String(message.user_code ?? "");
    const sentAt = message.client_ts;
    if (!code || typeof sentAt !== "number") return;
    const pending = pendingRef.current.get(code);
    if (!pending) return;
    window.clearTimeout(pending.timeoutId);
    pendingRef.current.delete(code);
    const latency = Date.now() - pending.sentAt;
    queueMicrotask(() => {
      setPlayers((previous) => previous.map((player) =>
        player.playerCode === code ? { ...player, playerLatencyMs: latency } : player,
      ));
    });
  }, [lastMessage, setPlayers]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      const now = Date.now();
      setPlayers((previous) => previous.map((player) => {
        const lastSeen = lastSeenRef.current[player.playerCode];
        if (lastSeen === undefined) return player;
        const connected = now - lastSeen < HEARTBEAT_TIMEOUT_MS;
        return player.playerConnected === connected ? player : { ...player, playerConnected: connected };
      }));
    }, OFFLINE_CHECK_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [setPlayers]);

  useEffect(() => {
    if (!enabled) return;

    const tick = () => {
      const targets = playersRef.current
        .filter((player) => player.playerConnected && player.playerCode)
        .map((player) => player.playerCode);
      if (targets.length === 0) return;

      const sentAt = Date.now();
      void sendMessageRef.current({ type: "ping_latency", targets, client_ts: sentAt });

      for (const code of targets) {
        const previous = pendingRef.current.get(code);
        if (previous) window.clearTimeout(previous.timeoutId);
        const timeoutId = window.setTimeout(() => {
          pendingRef.current.delete(code);
          setPlayers((current) => current.map((player) =>
            player.playerCode === code && player.playerLatencyMs !== null
              ? { ...player, playerLatencyMs: null }
              : player,
          ));
        }, PONG_TIMEOUT_MS);
        pendingRef.current.set(code, { sentAt, timeoutId });
      }
    };

    tickRef.current = tick;
    tick();
    const intervalId = window.setInterval(tick, intervalMs);
    const pendingAtTeardown = pendingRef.current;

    return () => {
      window.clearInterval(intervalId);
      for (const pending of pendingAtTeardown.values()) window.clearTimeout(pending.timeoutId);
      pendingAtTeardown.clear();
    };
  }, [enabled, intervalMs, setPlayers]);

  useEffect(() => {
    if (!enabled) return;
    const debounceId = window.setTimeout(() => tickRef.current(), PLAYER_CHANGE_DEBOUNCE_MS);
    return () => window.clearTimeout(debounceId);
  }, [enabled, players]);
}

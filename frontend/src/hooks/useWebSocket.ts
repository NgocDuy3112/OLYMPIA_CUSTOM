import { useCallback, useEffect, useRef, useState } from "react";
import { WS_BASE_URL } from "@/configs";
import type { WebSocketMessage, WebSocketPayload } from "@/types/websocket";
import { parseWebSocketMessage } from "@/types/websocket";
import { createLogger } from "@/utils/logger";

const logger = createLogger("WS");
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 16_000;
const DEBOUNCE_MS = 500;
const DEBOUNCED_EVENTS = new Set(["navigate", "start_the_timer", "play_bgm", "round_start"]);

const createWsUrl = (matchCode: string, token?: string) =>
  `${WS_BASE_URL}/ws/${matchCode}${token ? `?token=${encodeURIComponent(token)}` : ""}`;

export const useWebSocket = (matchCode: string, token?: string) => {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const messageDrainTimerRef = useRef<number | null>(null);
  const pendingMessagesRef = useRef<WebSocketMessage[]>([]);
  const isDrainingMessagesRef = useRef(false);
  const lastEventTimeRef = useRef<Record<string, number>>({});
  const [rawIsConnected, setRawIsConnected] = useState(false);
  const [rawLastMessage, setRawLastMessage] = useState<WebSocketMessage | null>(null);

  const isConnected = Boolean(matchCode) && rawIsConnected;
  const lastMessage = matchCode ? rawLastMessage : null;

  useEffect(() => {
    if (reconnectTimerRef.current !== null) window.clearTimeout(reconnectTimerRef.current);
    if (messageDrainTimerRef.current !== null) window.clearTimeout(messageDrainTimerRef.current);
    reconnectTimerRef.current = null;
    messageDrainTimerRef.current = null;
    reconnectAttemptsRef.current = 0;
    pendingMessagesRef.current = [];
    isDrainingMessagesRef.current = false;

    if (!matchCode) {
      wsRef.current?.close(1000, "no matchCode");
      wsRef.current = null;
      return;
    }

    const url = createWsUrl(matchCode, token);
    let closedByCleanup = false;

    const drainNextMessage = () => {
      if (closedByCleanup) {
        pendingMessagesRef.current = [];
        isDrainingMessagesRef.current = false;
        messageDrainTimerRef.current = null;
        return;
      }
      const nextMessage = pendingMessagesRef.current.shift();
      if (!nextMessage) {
        isDrainingMessagesRef.current = false;
        messageDrainTimerRef.current = null;
        return;
      }
      setRawLastMessage(nextMessage);
      messageDrainTimerRef.current = window.setTimeout(drainNextMessage, 0);
    };

    const enqueueMessage = (message: WebSocketMessage) => {
      pendingMessagesRef.current.push(message);
      if (isDrainingMessagesRef.current) return;
      isDrainingMessagesRef.current = true;
      messageDrainTimerRef.current = window.setTimeout(drainNextMessage, 0);
    };

    const connect = () => {
      if (wsRef.current && wsRef.current.readyState <= WebSocket.OPEN) {
        wsRef.current.close(1000, "reconnect-replace");
      }
      const socket = new WebSocket(url);
      wsRef.current = socket;

      socket.onopen = () => {
        if (closedByCleanup) return;
        reconnectAttemptsRef.current = 0;
        setRawIsConnected(true);
      };

      socket.onmessage = (event: MessageEvent<string>) => {
        if (closedByCleanup) return;
        try {
          const message = parseWebSocketMessage(event.data);
          if (message) enqueueMessage(message);
          else logger.warn("Ignored invalid WebSocket message");
        } catch (error) {
          logger.error("Error parsing message:", error);
        }
      };

      socket.onerror = (error) => {
        if (!closedByCleanup) logger.error("WebSocket Error:", error);
      };

      socket.onclose = () => {
        if (closedByCleanup) return;
        setRawIsConnected(false);
        const delay = Math.min(
          RECONNECT_BASE_MS * 2 ** reconnectAttemptsRef.current,
          RECONNECT_MAX_MS,
        );
        if (reconnectTimerRef.current !== null) window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = window.setTimeout(() => {
          reconnectAttemptsRef.current += 1;
          connect();
        }, delay);
      };
    };

    connect();

    return () => {
      closedByCleanup = true;
      if (reconnectTimerRef.current !== null) window.clearTimeout(reconnectTimerRef.current);
      if (messageDrainTimerRef.current !== null) window.clearTimeout(messageDrainTimerRef.current);
      reconnectTimerRef.current = null;
      messageDrainTimerRef.current = null;
      reconnectAttemptsRef.current = 0;
      pendingMessagesRef.current = [];
      isDrainingMessagesRef.current = false;
      const socket = wsRef.current;
      if (socket) {
        socket.onopen = null;
        socket.onmessage = null;
        socket.onerror = null;
        socket.onclose = null;
        socket.close(1000, "cleanup");
      }
      wsRef.current = null;
    };
  }, [matchCode, token]);

  const sendMessage = useCallback(async (payload: WebSocketPayload): Promise<boolean> => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return false;
    const eventType = typeof payload.type === "string" ? payload.type : "";
    if (DEBOUNCED_EVENTS.has(eventType)) {
      const now = Date.now();
      const lastTime = lastEventTimeRef.current[eventType] ?? 0;
      if (now - lastTime < DEBOUNCE_MS) return true;
      lastEventTimeRef.current[eventType] = now;
    }
    wsRef.current.send(JSON.stringify(payload));
    return true;
  }, []);

  return { isConnected, lastMessage, sendMessage };
};

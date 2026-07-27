/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useRef, useCallback } from "react";
import { WS_BASE_URL } from "@/configs";
import { createLogger } from "@/utils/logger";

const logger = createLogger("WS");

const createWsUrl = (matchCode: string, token?: string) =>
  `${WS_BASE_URL}/ws/${matchCode}${token ? `?token=${encodeURIComponent(token)}` : ``}`;

export const useWebSocket = (matchCode: string, token?: string) => {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const messageDrainTimerRef = useRef<number | null>(null);
  const pendingMessagesRef = useRef<any[]>([]);
  const isDrainingMessagesRef = useRef(false);

  // Exponential backoff: 1s → 2s → 4s → 8s → 15s (cap)
  const RECONNECT_BASE_MS = 1_000;
  const RECONNECT_MAX_MS = 16_000;
  const getReconnectDelay = () =>
    Math.min(RECONNECT_BASE_MS * 2 ** reconnectAttemptsRef.current, RECONNECT_MAX_MS);

  // Debounce: track last send time for events that trigger audio/navigation
  // Prevents duplicate events when user clicks buttons rapidly
  const lastEventTimeRef = useRef<Record<string, number>>({});
  const DEBOUNCE_MS = 500; // Minimum time between identical events

  const [rawIsConnected, setRawIsConnected] = useState(false);
  const [rawLastMessage, setRawLastMessage] = useState<any>(null);

  const isConnected = Boolean(matchCode) && rawIsConnected;
  const lastMessage = matchCode ? rawLastMessage : null;

  useEffect(() => {
    // clear reconnect timer mỗi lần matchCode đổi
    if (reconnectTimerRef.current) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    reconnectAttemptsRef.current = 0; // reset backoff on matchCode change

    if (messageDrainTimerRef.current) {
      window.clearTimeout(messageDrainTimerRef.current);
      messageDrainTimerRef.current = null;
    }
    pendingMessagesRef.current = [];
    isDrainingMessagesRef.current = false;

    // Nếu matchCode rỗng: đóng socket và thoát (không setState sync)
    if (!matchCode) {
      logger.info("No matchCode provided, skipping WebSocket connection");
      if (wsRef.current) {
        wsRef.current.close(1000, "no matchCode");
        wsRef.current = null;
      }
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
      if (typeof nextMessage === "undefined") {
        isDrainingMessagesRef.current = false;
        messageDrainTimerRef.current = null;
        return;
      }

      setRawLastMessage(nextMessage);
      messageDrainTimerRef.current = window.setTimeout(drainNextMessage, 0);
    };

    const enqueueMessage = (message: any) => {
      pendingMessagesRef.current.push(message);
      if (isDrainingMessagesRef.current) return;
      isDrainingMessagesRef.current = true;
      messageDrainTimerRef.current = window.setTimeout(drainNextMessage, 0);
    };

    const connect = () => {
      if (wsRef.current && wsRef.current.readyState <= WebSocket.OPEN) {
        try {
          wsRef.current.close(1000, "reconnect-replace");
        } catch (e) {
          logger.warn("Error while closing existing WebSocket during reconnect:", e);
        }
        wsRef.current = null;
      }
      const socket = new WebSocket(url);
      wsRef.current = socket;

      socket.onopen = () => {
        if (closedByCleanup) return;
        logger.info(`Connected to match: ${matchCode}`);
        reconnectAttemptsRef.current = 0; // reset backoff on successful connect
        setRawIsConnected(true);
      };

      socket.onmessage = (event) => {
        if (closedByCleanup) return;
        try {
          console.info(`[WS:${matchCode}] raw frame:`, event.data);
          const raw = JSON.parse(event.data);
          enqueueMessage(raw);
          logger.debug("Received WS message:", raw);
        } catch (error) {
          logger.error("Error parsing message:", error);
        }
      };

      socket.onerror = (error) => {
        if (closedByCleanup) return;
        logger.error("WebSocket Error:", error);
      };

      socket.onclose = () => {
        if (closedByCleanup) return;
        const attempt = reconnectAttemptsRef.current + 1;
        const delay = getReconnectDelay();
        logger.info(
          `Disconnected from match: ${matchCode} — reconnect #${attempt} in ${delay}ms`,
        );
        setRawIsConnected(false);

        if (reconnectTimerRef.current) {
          window.clearTimeout(reconnectTimerRef.current);
          reconnectTimerRef.current = null;
        }

        reconnectTimerRef.current = window.setTimeout(() => {
          reconnectAttemptsRef.current += 1;
          logger.info("Reconnecting...");
          connect(); // ✅ reconnect đúng cách (gắn handler lại)
        }, delay);
      };
    };

    connect();

    return () => {
      closedByCleanup = true;

      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      reconnectAttemptsRef.current = 0; // reset backoff on cleanup

      if (messageDrainTimerRef.current) {
        window.clearTimeout(messageDrainTimerRef.current);
        messageDrainTimerRef.current = null;
      }
      pendingMessagesRef.current = [];
      isDrainingMessagesRef.current = false;

      const s = wsRef.current;
      if (s) {
        s.onopen = null;
        s.onmessage = null;
        s.onerror = null;
        s.onclose = null;
        s.close(1000, "cleanup");
      }
      wsRef.current = null;

      // optional: reset raw state async (không bắt buộc vì đã “gated”)
      Promise.resolve().then(() => {
        setRawIsConnected(false);
        setRawLastMessage(null);
      });
    };
  }, [matchCode]);

  const sendMessage = useCallback(async (payload: Record<string, unknown>): Promise<boolean> => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      // Debounce logic for audio/navigation events
      const eventType = payload.type as string;
      const eventsToDebounce = ['navigate', 'start_the_timer', 'play_bgm', 'round_start'];
      
      if (eventsToDebounce.includes(eventType)) {
        const now = Date.now();
        const lastTime = lastEventTimeRef.current[eventType] || 0;
        
        // Skip if this event was sent too recently
        if (now - lastTime < DEBOUNCE_MS) {
          logger.debug(`Debounced ${eventType} event (${now - lastTime}ms < ${DEBOUNCE_MS}ms)`);
          return true; // Return true to avoid error handling in UI
        }
        
        lastEventTimeRef.current[eventType] = now;
      }
      
      wsRef.current.send(JSON.stringify(payload));
      logger.debug("Sent payload:", payload);
      return true;
    }
    logger.warn("Cannot send message: Not connected.");
    return false;
  }, []);

  return {
    isConnected,
    lastMessage,
    sendMessage,
  };
};
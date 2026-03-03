/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useRef, useCallback } from "react";
import { API_BASE_URL, WS_BASE_URL } from "@/configs";
import { createLogger } from "@/utils/logger";

const logger = createLogger("WS");

interface WebSocketPayload {
  type: string;
  user_code: string;
  question_code?: string;
  answer?: string;
  [key: string]: any;
}

const createWsUrl = (matchCode: string) => `${WS_BASE_URL}/ws/${matchCode}`;

export const useWebSocket = (matchCode: string) => {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);

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

    // Nếu matchCode rỗng: đóng socket và thoát (không setState sync)
    if (!matchCode) {
      logger.info("No matchCode provided, skipping WebSocket connection");
      if (wsRef.current) {
        wsRef.current.close(1000, "no matchCode");
        wsRef.current = null;
      }
      return;
    }

    const url = createWsUrl(matchCode);
    let closedByCleanup = false;

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
        setRawIsConnected(true);
      };

      socket.onmessage = (event) => {
        if (closedByCleanup) return;
        try {
          console.info(`[WS:${matchCode}] raw frame:`, event.data);
          const raw = JSON.parse(event.data);
          setRawLastMessage(raw);
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
        logger.info(`Disconnected from match: ${matchCode}`);
        setRawIsConnected(false);

        if (reconnectTimerRef.current) {
          window.clearTimeout(reconnectTimerRef.current);
          reconnectTimerRef.current = null;
        }

        reconnectTimerRef.current = window.setTimeout(() => {
          logger.info("Reconnecting...");
          connect(); // ✅ reconnect đúng cách (gắn handler lại)
        }, 3000);
      };
    };

    connect();

    return () => {
      closedByCleanup = true;

      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }

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

  const sendMessage = useCallback(async (payload: WebSocketPayload): Promise<boolean> => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload));
      logger.debug("Sent payload:", payload);
      return true;
    }
    logger.warn("Cannot send message: Not connected.");
    return false;
  }, []);

  const sendAnswer = useCallback(
    async (playerCode: string, questionCode: string, answer: string, timestamp: number, token: string): Promise<boolean> => {
      await fetch(`${API_BASE_URL}/answers/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({
          user_code: playerCode,
          match_code: matchCode,
          question_code: questionCode,
          answer_text: answer.trim(),
          timestamp,
        }),
      });

      return await sendMessage({
        type: "answer",
        user_code: playerCode,
        question_code: questionCode,
        answer_text: answer.trim(),
        timestamp,
      });
    },
    [sendMessage, matchCode]
  );

  const sendBuzz = useCallback(
    async (playerCode: string, questionCode: string, token: string): Promise<boolean> => {
      await fetch(`${API_BASE_URL}/answers/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({
          user_code: playerCode,
          match_code: matchCode,
          question_code: questionCode,
          has_buzzed: true,
        }),
      });

      return await sendMessage({
        type: "buzz",
        user_code: playerCode,
        question_code: questionCode,
        has_buzzed: true,
      });
    },
    [sendMessage, matchCode]
  );

  return {
    isConnected,
    lastMessage,
    sendMessage,
    sendAnswer,
    sendBuzz,
  };
};
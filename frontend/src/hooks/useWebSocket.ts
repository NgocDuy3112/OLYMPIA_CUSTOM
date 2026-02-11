/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useRef, useCallback } from "react";
import { API_BASE_URL, WS_BASE_URL } from "@/configs";
import { createLogger } from "@/utils/logger";

const logger = createLogger("WS");


interface WebSocketPayload {
    type: string;
    player_code: string;
    question_code?: string;
    answer?: string;
    [key: string]: any; 
}

const createWsUrl = (matchCode: string) => `${WS_BASE_URL}/ws/${matchCode}`;



export const useWebSocket = (matchCode: string) => { 
    const ws = useRef<WebSocket | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const [lastMessage, setLastMessage] = useState<any>(null); 

    useEffect(() => {
        const url = createWsUrl(matchCode);
        if (ws.current && ws.current.readyState === WebSocket.OPEN) {
            ws.current.close();
        }
        ws.current = new WebSocket(url);

        ws.current.onopen = () => {
            logger.info(`Connected to match: ${matchCode}`);
            setIsConnected(true);
        };

        ws.current.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                setLastMessage(message); 
            } catch (error) {
                logger.error("Error parsing message:", error);
            }
        };

        ws.current.onclose = () => {
            logger.info(`Disconnected from match: ${matchCode}`);
            setIsConnected(false);
            setTimeout(() => {
                if (!ws.current || ws.current.readyState === WebSocket.CLOSED) {
                    ws.current = new WebSocket(url);
                    logger.info(`Reconnecting...`);
                }
            }, 3000);
        };

        ws.current.onerror = (error) => {
            logger.error("WebSocket Error:", error);
        };

        return () => {
            if (ws.current && ws.current.readyState === WebSocket.OPEN) {
                ws.current.close();
            }
        };
    }, [matchCode]); 


    const sendMessage = useCallback(async (payload: WebSocketPayload): Promise<boolean> => {
        if (ws.current && ws.current.readyState === WebSocket.OPEN) {
            ws.current.send(JSON.stringify(payload));
            logger.debug("Sent payload:", payload);
            return true;
        } else {
            logger.warn("Cannot send message: Not connected.");
            return false;
        }
    }, []);


    const sendAnswer = useCallback(async (playerCode: string, questionCode: string, answer: string, timestamp: number, token: string): Promise<boolean> => {
        await fetch(`${API_BASE_URL}/answers/`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({ 
                player_code: playerCode,
                match_code: matchCode,
                question_code: questionCode,
                answer_text: answer.trim(),
                timestamp: timestamp
            }),
        });
        return await sendMessage({
            type: "answer",
            player_code: playerCode,
            question_code: questionCode,
            answer_text: answer.trim(),
            timestamp: timestamp
        });
    }, [sendMessage, matchCode]);


    const sendBuzz = useCallback(async (playerCode: string, questionCode: string, token: string): Promise<boolean> => {
        await fetch(`${API_BASE_URL}/answers/`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({ 
                player_code: playerCode,
                match_code: matchCode,
                question_code: questionCode,
                has_buzzed: true
            }),
        });
        return await sendMessage({
            type: "buzz",
            player_code: playerCode,
            question_code: questionCode,
            has_buzzed: true
        });
    }, [sendMessage, matchCode]);


    return { 
        isConnected, 
        lastMessage, 
        sendMessage,
        sendAnswer,
        sendBuzz,
    };
};
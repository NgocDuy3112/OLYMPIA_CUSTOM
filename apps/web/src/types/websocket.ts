/**
 * WebSocket types — canonical definitions live in `@oc/shared`.
 * Re-exported here so app code keeps importing from `@/types/websocket`.
 */
export type {
  UserRole,
  WebSocketMessage,
  WebSocketPayload,
  WebSocketContextValue,
} from "@oc/shared";
export {
  parseWebSocketMessage,
  unwrapWebSocketMessage,
} from "@oc/shared";

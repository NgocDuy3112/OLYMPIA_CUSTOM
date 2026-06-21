import json
import asyncio
from fastapi import WebSocket, WebSocketDisconnect
from valkey.asyncio import Valkey
from logger import global_logger

class ConnectionManager:
    def __init__(self):
        self.rooms: dict[str, list[WebSocket]] = {}
        # Maps a connected WebSocket to the authenticated user_code it
        # represents. Populated by `connect()` and cleared by `disconnect()`.
        # Used to authoritatively decide which players are still eligible
        # to pick a Về Đích power (the server-side companion to the
        # frontend `veDich_powers_${matchCode}` localStorage cache).
        self._socket_user: dict[WebSocket, str] = {}
        self.valkey: Valkey | None = None
        self._room_tasks: dict[str, asyncio.Task] = {}

    def set_valkey(self, valkey: Valkey):
        self.valkey = valkey
        global_logger.info("Valkey instance set in ConnectionManager.")

        # Nếu set_valkey sau khi đã có room, start listener cho các room đó
        for room_id in list(self.rooms.keys()):
            if room_id not in self._room_tasks:
                self._room_tasks[room_id] = asyncio.create_task(self.__listen_to_valkey_channel(room_id))

    async def __listen_to_valkey_channel(self, room_id: str):
        if not self.valkey:
            global_logger.warning(f"Valkey not initialized for room {room_id}")
            return

        retry_count = 0
        max_retries = 5
        retry_delay = 1.0  # seconds

        while retry_count < max_retries:
            try:
                pubsub = self.valkey.pubsub()
                await pubsub.subscribe(room_id)
                global_logger.info(f"[WS] Subscribed to Valkey channel for room {room_id} (attempt {retry_count + 1})")
                retry_count = 0  # Reset retry count on successful subscribe

                async for message in pubsub.listen():
                    if message.get("type") != "message":
                        continue
                    try:
                        data = json.loads(message["data"])
                    except Exception:
                        global_logger.warning(f"[WS] Invalid JSON from Valkey channel {room_id}: {message.get('data')}", exc_info=True)
                        continue

                    # ✅ nhận từ Valkey => SEND ra websocket local
                    await self.send_to_room_local(room_id, data)

            except asyncio.CancelledError:
                global_logger.info(f"[WS] Valkey listener cancelled for room {room_id}")
                raise
            except Exception as e:
                retry_count += 1
                global_logger.error(f"[WS] Valkey listener error for room {room_id} (attempt {retry_count}/{max_retries}): {e}", exc_info=True)
                if retry_count < max_retries:
                    global_logger.info(f"[WS] Retrying in {retry_delay}s for room {room_id}")
                    await asyncio.sleep(retry_delay)
                else:
                    global_logger.error(f"[WS] Max retries reached for room {room_id}, giving up")
            finally:
                try:
                    await pubsub.unsubscribe(room_id)
                    await pubsub.close()
                except Exception:
                    pass

        global_logger.info(f"[WS] Unsubscribed from Valkey channel for room {room_id} after {max_retries} retries")

    async def connect(self, websocket: WebSocket, room_id: str, user_code: str | None = None):
        await websocket.accept()

        if room_id not in self.rooms:
            self.rooms[room_id] = []
            if self.valkey and room_id not in self._room_tasks:
                self._room_tasks[room_id] = asyncio.create_task(self.__listen_to_valkey_channel(room_id))

        self.rooms[room_id].append(websocket)
        if user_code:
            # `WebSocket` is not hashable across all transports, but FastAPI
            # hands us the same instance for the lifetime of the connection,
            # so identity-keying on the object is safe here.
            self._socket_user[websocket] = user_code
        global_logger.info(f"WS connected to room {room_id}: {websocket.client} (count={len(self.rooms[room_id])})")

    def disconnect(self, websocket: WebSocket, room_id: str):
        conns = self.rooms.get(room_id)
        if not conns:
            return

        try:
            conns.remove(websocket)
        except ValueError:
            pass

        # Always drop the user→socket mapping, even if the room was already
        # emptied by a previous call. This guarantees no stale entries survive
        # a reconnect.
        self._socket_user.pop(websocket, None)

        if not conns:
            del self.rooms[room_id]
            task = self._room_tasks.pop(room_id, None)
            if task:
                task.cancel()

        global_logger.info(f"WS disconnected from room {room_id}: {websocket.client}")

    def user_codes_in_room(self, room_id: str) -> list[str]:
        """Return the unique authenticated user_codes connected to `room_id`.

        Used by the WS receive loop to compute the `eligible_user_codes`
        list when broadcasting `vd_power_window_open`.
        """
        conns = self.rooms.get(room_id, [])
        seen: set[str] = set()
        out: list[str] = []
        for ws in conns:
            code = self._socket_user.get(ws)
            if code and code not in seen:
                seen.add(code)
                out.append(code)
        return out

    async def send_to_room_local(self, room_id: str, payload: dict):
        conns = list(self.rooms.get(room_id, []))
        if not conns:
            global_logger.warning(f"[WS] send_to_room_local: No connections in room {room_id!r} (type={payload.get('type')!r})")
            return

        dead: list[WebSocket] = []
        success_count = 0
        for ws in conns:
            try:
                await ws.send_json(payload)
                success_count += 1
            except WebSocketDisconnect:
                global_logger.info(f"[WS] Player disconnected (WebSocketDisconnect): {ws.client}")
                dead.append(ws)
            except Exception as e:
                global_logger.error(f"[WS] Failed to send to connection {ws.client}: {e}")
                dead.append(ws)

        # Cleanup dead connections
        for ws in dead:
            self.disconnect(ws, room_id)

        global_logger.debug(f"[WS] Sent to room={room_id!r} type={payload.get('type')!r} total={len(conns)} success={success_count} dead={len(dead)}")

    async def broadcast_to_room(self, room_id: str, payload: dict):
        global_logger.debug(f"[WS] broadcast_to_room: room={room_id!r} type={payload.get('type')!r} user={payload.get('user_code')!r}")

        # Always send to local connections first (immediate delivery)
        await self.send_to_room_local(room_id, payload)

        # Then publish to Valkey for cross-instance broadcast (if Valkey is available)
        if self.valkey:
            try:
                await self.valkey.publish(room_id, json.dumps(payload))
                global_logger.debug(f"[WS] Published to Valkey channel {room_id!r}")
            except Exception as e:
                global_logger.error(f"[WS] Failed to publish to Valkey: {e}", exc_info=True)
        else:
            global_logger.debug(f"[WS] Valkey not set, sending local only")

    async def shutdown(self):
        """Gracefully cancel all Valkey pub/sub listener tasks on shutdown."""
        for room_id, task in list(self._room_tasks.items()):
            if not task.done():
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass
                global_logger.info(f"Cancelled Valkey listener for room {room_id!r}")
        self._room_tasks.clear()
        self.rooms.clear()
        global_logger.info("ConnectionManager shutdown complete.")


manager = ConnectionManager()
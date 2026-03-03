import json
import asyncio
from fastapi import WebSocket, WebSocketDisconnect
from valkey.asyncio import Valkey
from logger import global_logger

class ConnectionManager:
    def __init__(self):
        self.rooms: dict[str, list[WebSocket]] = {}
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

        pubsub = self.valkey.pubsub()
        await pubsub.subscribe(room_id)
        global_logger.info(f"Subscribed to Valkey channel for room {room_id}")

        try:
            async for message in pubsub.listen():
                if message.get("type") != "message":
                    continue
                try:
                    data = json.loads(message["data"])
                except Exception:
                    global_logger.warning(f"Invalid JSON from Valkey channel {room_id}: {message.get('data')}")
                    continue

                # ✅ nhận từ Valkey => SEND ra websocket local
                await self.send_to_room_local(room_id, data)

        except Exception as e:
            global_logger.error(f"Valkey listener error for room {room_id}: {e}", exc_info=True)
        finally:
            try:
                await pubsub.unsubscribe(room_id)
                await pubsub.close()
            except Exception:
                pass
            global_logger.info(f"Unsubscribed from Valkey channel for room {room_id}")

    async def connect(self, websocket: WebSocket, room_id: str):
        await websocket.accept()

        if room_id not in self.rooms:
            self.rooms[room_id] = []
            if self.valkey and room_id not in self._room_tasks:
                self._room_tasks[room_id] = asyncio.create_task(self.__listen_to_valkey_channel(room_id))

        self.rooms[room_id].append(websocket)
        global_logger.info(f"WS connected to room {room_id}: {websocket.client} (count={len(self.rooms[room_id])})")

    def disconnect(self, websocket: WebSocket, room_id: str):
        conns = self.rooms.get(room_id)
        if not conns:
            return

        try:
            conns.remove(websocket)
        except ValueError:
            pass

        if not conns:
            del self.rooms[room_id]
            task = self._room_tasks.pop(room_id, None)
            if task:
                task.cancel()

        global_logger.info(f"WS disconnected from room {room_id}: {websocket.client}")

    async def send_to_room_local(self, room_id: str, payload: dict):
        conns = list(self.rooms.get(room_id, []))
        if not conns:
            return

        dead: list[WebSocket] = []
        for ws in conns:
            try:
                await ws.send_json(payload)
            except Exception:
                dead.append(ws)

        for ws in dead:
            self.disconnect(ws, room_id)

        global_logger.debug(f"Sent local room={room_id} conns={len(conns)} dead={len(dead)} type={payload.get('type')}")

    async def broadcast_to_room(self, room_id: str, payload: dict):
        if self.valkey:
            await self.valkey.publish(room_id, json.dumps(payload))
        else:
            await self.send_to_room_local(room_id, payload)


manager = ConnectionManager()
import json
import asyncio
from fastapi import WebSocket
from valkey.asyncio import Valkey

from logger import global_logger



class ConnectionManager:
    def __init__(self):
        self.rooms: dict[str, list[WebSocket]] = {}
        self.valkey: Valkey = None

    def set_valkey(self, valkey: Valkey):
        self.valkey = valkey
        global_logger.info("Valkey instance set in ConnectionManager.")

    async def __listen_to_valkey_channel(self, room_id: str):
        pubsub = self.valkey.pubsub()
        await pubsub.subscribe(room_id)
        global_logger.info(f"Subscribed to Valkey channel for room {room_id}")
        try:
            async for message in pubsub.listen():
                if message['type'] == 'message':
                    data = json.loads(message['data'])
                    await self.broadcast_to_room(room_id, data)
                    global_logger.info(f"Broadcasted message to room {room_id} from Valkey channel: {data}")
        except Exception as e:
            global_logger.error(f"Error listening to Valkey channel for room {room_id}: {e}")
        finally:
            await pubsub.unsubscribe(room_id)
            global_logger.info(f"Unsubscribed from Valkey channel for room {room_id}")

    async def connect(self, websocket: WebSocket, room_id: str):
        await websocket.accept()
        if room_id not in self.rooms:
            self.rooms[room_id] = []
            asyncio.create_task(self.__listen_to_valkey_channel(room_id))
        self.rooms[room_id].append(websocket)
        global_logger.info(f"WS connected to room {room_id}: {websocket.client}")

    def disconnect(self, websocket: WebSocket, room_id: str):
        if room_id in self.rooms:
            self.rooms[room_id].remove(websocket)
            if not self.rooms[room_id]:
                del self.rooms[room_id]
        global_logger.info(f"WS disconnected from room {room_id}: {websocket.client}")

    async def broadcast_to_room(self, room_id: str, message: dict):
        if self.valkey:
            await self.valkey.publish(f"{room_id}", json.dumps(message))



manager = ConnectionManager()
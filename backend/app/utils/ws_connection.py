import json
import asyncio
from fastapi import WebSocket
from valkey.asyncio import Valkey
from valkey.exceptions import AuthenticationError, ConnectionError as ValkeyConnectionError

from logger import global_logger



class ConnectionManager:
    def __init__(self):
        self.rooms: dict[str, list[WebSocket]] = {}
        self.valkey: Valkey = None

    def set_valkey(self, valkey: Valkey):
        self.valkey = valkey
        global_logger.info("Valkey instance set in ConnectionManager.")

    async def __listen_to_valkey_channel(self, room_id: str):
        """Listen to Valkey pub/sub channel for room messages.
        
        Handles authentication errors by logging detailed diagnostics.
        """
        if not self.valkey:
            global_logger.warning(f"Valkey not initialized for room {room_id}")
            return
            
        pubsub = None
        try:
            pubsub = self.valkey.pubsub()
            await pubsub.subscribe(room_id)
            global_logger.info(f"Subscribed to Valkey channel for room {room_id}")
            
            async for message in pubsub.listen():
                if message['type'] == 'message':
                    try:
                        data = json.loads(message['data'])
                        await self.broadcast_to_room(room_id, data)
                        global_logger.debug(f"Broadcasted message to room {room_id} from Valkey: {data}")
                    except json.JSONDecodeError:
                        global_logger.warning(f"Invalid JSON from Valkey channel {room_id}: {message['data']}")
                        
        except AuthenticationError as e:
            global_logger.error(
                f"Valkey authentication error for room {room_id}. "
                f"Verify VALKEY_PASSWORD and VALKEY_HOST/PORT environment variables. "
                f"Error: {str(e)}",
                exc_info=True
            )
        except ValkeyConnectionError as e:
            global_logger.error(
                f"Valkey connection error for room {room_id}. "
                f"Verify Valkey server is running. Error: {str(e)}",
                exc_info=True
            )
        except Exception as e:
            global_logger.error(f"Error listening to Valkey channel for room {room_id}: {str(e)}", exc_info=True)
        finally:
            if pubsub:
                try:
                    await pubsub.unsubscribe(room_id)
                    await pubsub.close()
                    global_logger.info(f"Unsubscribed from Valkey channel for room {room_id}")
                except Exception as cleanup_error:
                    global_logger.warning(f"Error cleaning up pubsub for room {room_id}: {cleanup_error}")

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
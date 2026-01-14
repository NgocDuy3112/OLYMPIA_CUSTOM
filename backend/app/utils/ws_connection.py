from fastapi import WebSocket
from logger import global_logger



class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        global_logger.info(f"WebSocket connected: {websocket.client}")

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)
        global_logger.info(f"WebSocket disconnected: {websocket.client}")

    async def broadcast(self, message: str):
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
                global_logger.info(f"WebSocket message sent to: {connection.client}")
            except Exception as e:
                global_logger.error(f"Failed to send message to: {connection.client}. Error: {e}")



manager = ConnectionManager()
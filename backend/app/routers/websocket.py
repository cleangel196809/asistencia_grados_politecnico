from typing import Dict, List

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter()


class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, evento_id: str):
        await websocket.accept()
        self.active_connections.setdefault(evento_id, []).append(websocket)

    def disconnect(self, websocket: WebSocket, evento_id: str):
        if evento_id not in self.active_connections:
            return
        if websocket in self.active_connections[evento_id]:
            self.active_connections[evento_id].remove(websocket)
        if not self.active_connections[evento_id]:
            self.active_connections.pop(evento_id, None)

    async def broadcast(self, evento_id: str, message: dict):
        for connection in list(self.active_connections.get(evento_id, [])):
            try:
                await connection.send_json(message)
            except Exception:
                self.disconnect(connection, evento_id)


manager = ConnectionManager()


async def broadcast_to_event(evento_id: str, message: dict):
    await manager.broadcast(evento_id, message)


@router.websocket("/attendance/{evento_id}")
async def websocket_attendance(websocket: WebSocket, evento_id: str):
    await manager.connect(websocket, evento_id)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket, evento_id)

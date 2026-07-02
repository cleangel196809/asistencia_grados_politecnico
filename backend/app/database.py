import os
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

try:
    import mongomock
except ImportError:  # pragma: no cover
    mongomock = None

try:
    from pymongo import MongoClient
except ImportError:  # pragma: no cover
    MongoClient = None


class AttendanceStore:
    def __init__(self) -> None:
        self.mode = "memory"
        self.db = None
        self.client = None
        self._connect()
        self._seed_demo_data()

    def _connect(self) -> None:
        uri = os.getenv("MONGO_URI", "mongodb://localhost:27017")
        db_name = os.getenv("MONGO_DB", "attendance_system")
        if MongoClient is not None and uri and uri != "memory":
            try:
                self.client = MongoClient(uri, serverSelectionTimeoutMS=1500)
                self.client.admin.command("ping")
                self.db = self.client[db_name]
                self.mode = "mongo"
                return
            except Exception:
                pass
        if mongomock is not None:
            self.client = mongomock.MongoClient()
            self.db = self.client[db_name]
            self.mode = "mock"
            return
        raise RuntimeError("No MongoDB or mongomock available")

    def _seed_demo_data(self) -> None:
        if self.db.events.count_documents({}) == 0:
            event_id = str(uuid.uuid4())
            self.db.events.insert_one(
                {
                    "id": event_id,
                    "name": "Expo de Tecnología 2026",
                    "date": "2026-09-15",
                    "location": "Auditorio Politécnico Internacional",
                    "capacity": 200,
                    "mode": "ONLINE",
                    "schedule": "09:00 - 13:00",
                    "created_at": datetime.utcnow().isoformat(),
                }
            )
            self.db.participants.insert_one(
                {
                    "id": str(uuid.uuid4()),
                    "event_id": event_id,
                    "name": "Ana Gómez",
                    "cedula": "1002003004",
                    "email": "ana@example.com",
                    "phone": "3001002000",
                    "ticket_count": 1,
                    "program": "Ingeniería de Sistemas",
                    "sede": "Central",
                    "cohorte": "2024",
                    "promedio": "4.5",
                    "created_at": datetime.utcnow().isoformat(),
                }
            )
        if self.db.users.count_documents({}) == 0:
            self.db.users.insert_many(
                [
                    {"id": str(uuid.uuid4()), "username": "admin", "password": "admin123", "role": "ADMIN", "created_at": datetime.utcnow().isoformat()},
                    {"id": str(uuid.uuid4()), "username": "logistico", "password": "logis123", "role": "LOGISTICO", "created_at": datetime.utcnow().isoformat()},
                    {"id": str(uuid.uuid4()), "username": "scanner", "password": "scanner123", "role": "SCANNER", "created_at": datetime.utcnow().isoformat()},
                ]
            )

    def _clean_document(self, document: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        if document is None:
            return None
        document.pop('_id', None)
        return document

    def _clean_documents(self, documents: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        return [{k: v for k, v in doc.items() if k != '_id'} for doc in documents]

    def list_events(self) -> List[Dict[str, Any]]:
        return self._clean_documents(list(self.db.events.find({}).sort("created_at", 1)))

    def create_event(self, event: Dict[str, Any]) -> Dict[str, Any]:
        record = {**event, "id": event.get("id") or str(uuid.uuid4())}
        self.db.events.insert_one(record)
        return self._clean_document(record)

    def update_event(self, event_id: str, event: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        self.db.events.update_one({"id": event_id}, {"$set": event})
        return self._clean_document(self.db.events.find_one({"id": event_id}))

    def delete_event(self, event_id: str) -> bool:
        self.db.participants.delete_many({"event_id": event_id})
        self.db.attendances.delete_many({"event_id": event_id})
        result = self.db.events.delete_one({"id": event_id})
        return result.deleted_count > 0

    def list_participants(self, event_id: str) -> List[Dict[str, Any]]:
        return self._clean_documents(list(self.db.participants.find({"event_id": event_id}).sort("created_at", 1)))

    def create_participant(self, participant: Dict[str, Any]) -> Dict[str, Any]:
        record = {**participant, "id": participant.get("id") or str(uuid.uuid4())}
        self.db.participants.insert_one(record)
        return self._clean_document(record)

    def update_participant(self, participant_id: str, participant: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        self.db.participants.update_one({"id": participant_id}, {"$set": participant})
        return self._clean_document(self.db.participants.find_one({"id": participant_id}))

    def delete_participant(self, participant_id: str) -> bool:
        result = self.db.participants.delete_one({"id": participant_id})
        return result.deleted_count > 0

    def get_participant(self, participant_id: str) -> Optional[Dict[str, Any]]:
        return self._clean_document(self.db.participants.find_one({"id": participant_id}))

    def get_event(self, event_id: str) -> Optional[Dict[str, Any]]:
        return self._clean_document(self.db.events.find_one({"id": event_id}))

    def create_attendance(self, attendance: Dict[str, Any]) -> Dict[str, Any]:
        record = {**attendance, "id": attendance.get("id") or str(uuid.uuid4())}
        self.db.attendances.insert_one(record)
        return self._clean_document(record)

    def list_attendances(self, event_id: str) -> List[Dict[str, Any]]:
        return self._clean_documents(list(self.db.attendances.find({"event_id": event_id}).sort("timestamp", -1)))

    def find_attendance_by_token(self, event_id: str, token: str) -> Optional[Dict[str, Any]]:
        return self.db.attendances.find_one({"event_id": event_id, "token": token})

    def list_attendances_for_participant(self, event_id: str, participant_id: str) -> List[Dict[str, Any]]:
        return self._clean_documents(list(self.db.attendances.find({"event_id": event_id, "participant_id": participant_id}).sort("timestamp", -1)))

    def find_attendance(self, event_id: str, participant_id: str) -> Optional[Dict[str, Any]]:
        return self.db.attendances.find_one({"event_id": event_id, "participant_id": participant_id})

    def list_users(self) -> List[Dict[str, Any]]:
        return self._clean_documents(list(self.db.users.find({}, {"password": 0}).sort("username", 1)))

    def create_user(self, user: Dict[str, Any]) -> Dict[str, Any]:
        existing = self.db.users.find_one({"username": user["username"]})
        if existing:
            raise ValueError("User already exists")
        record = {**user, "id": user.get("id") or str(uuid.uuid4()), "created_at": datetime.utcnow().isoformat()}
        self.db.users.insert_one(record)
        return self._clean_document(record)

    def delete_user(self, user_id: str) -> bool:
        result = self.db.users.delete_one({"id": user_id})
        return result.deleted_count > 0

    def update_user(self, user_id: str, changes: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        existing = self.db.users.find_one({"id": user_id})
        if not existing:
            return None
        self.db.users.update_one({"id": user_id}, {"$set": changes})
        updated = self.db.users.find_one({"id": user_id}, {"password": 0})
        return self._clean_document(updated)

    def validate_user(self, username: str, password: str, role: Optional[str] = None) -> Optional[Dict[str, Any]]:
        query = {"username": username, "password": password}
        if role:
            query["role"] = role.upper()
        return self._clean_document(self.db.users.find_one(query, {"password": 0}))

    def search_participants(self, cedula: str, event_id: Optional[str] = None) -> List[Dict[str, Any]]:
        query = {"cedula": cedula}
        if event_id:
            query["event_id"] = event_id
        return self._clean_documents(list(self.db.participants.find(query).sort("created_at", 1)))


store = AttendanceStore()

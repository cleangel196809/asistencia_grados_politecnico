from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException

from ..database import get_db
from ..models.event import EventCreate, EventUpdate
from ..utils.auth import get_current_user
from ..utils.helpers import parse_object_id, serialize_doc, serialize_list

router = APIRouter()


def ensure_admin(current_user: dict):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin required")


@router.get("/")
async def list_events(current_user=Depends(get_current_user)):
    db = get_db()
    events = await db.events.find().sort("fecha", 1).to_list(None)
    return serialize_list(events)


@router.post("/")
async def create_event(event: EventCreate, current_user=Depends(get_current_user)):
    ensure_admin(current_user)
    db = get_db()
    event_doc = event.model_dump()
    event_doc["created_at"] = datetime.utcnow()
    result = await db.events.insert_one(event_doc)
    created = await db.events.find_one({"_id": result.inserted_id})
    return serialize_doc(created)


@router.get("/{event_id}")
async def get_event(event_id: str, current_user=Depends(get_current_user)):
    db = get_db()
    object_id = parse_object_id(event_id, "Event")
    event = await db.events.find_one({"_id": object_id})
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    return serialize_doc(event)


@router.put("/{event_id}")
async def update_event(event_id: str, event: EventUpdate, current_user=Depends(get_current_user)):
    ensure_admin(current_user)
    db = get_db()
    object_id = parse_object_id(event_id, "Event")
    update_data = event.model_dump(exclude_unset=True)
    result = await db.events.update_one({"_id": object_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Event not found")
    updated = await db.events.find_one({"_id": object_id})
    return serialize_doc(updated)


@router.delete("/{event_id}")
async def delete_event(event_id: str, current_user=Depends(get_current_user)):
    ensure_admin(current_user)
    db = get_db()
    object_id = parse_object_id(event_id, "Event")
    result = await db.events.delete_one({"_id": object_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Event not found")
    return {"message": "Event deleted"}

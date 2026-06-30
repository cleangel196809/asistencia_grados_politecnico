from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException

from ..database import get_db
from ..models.user import UserCreate, UserUpdate
from ..utils.auth import get_current_user, get_password_hash
from ..utils.helpers import parse_object_id, serialize_doc, serialize_list

router = APIRouter()


async def require_admin(current_user=Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin required")
    return current_user


@router.get("/")
async def list_users(current_user=Depends(require_admin)):
    db = get_db()
    users = await db.users.find().sort("created_at", -1).to_list(None)
    return serialize_list(users)


@router.post("/")
async def create_user(user: UserCreate, current_user=Depends(require_admin)):
    db = get_db()
    existing = await db.users.find_one({"username": user.username})
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists")

    user_doc = {
        "username": user.username,
        "password_hash": get_password_hash(user.password),
        "full_name": user.full_name,
        "role": user.role,
        "active": user.active,
        "created_at": datetime.utcnow(),
    }
    result = await db.users.insert_one(user_doc)
    created = await db.users.find_one({"_id": result.inserted_id})
    return serialize_doc(created)


@router.put("/{user_id}")
async def update_user(user_id: str, user: UserUpdate, current_user=Depends(require_admin)):
    db = get_db()
    object_id = parse_object_id(user_id, "User")
    update_data = user.model_dump(exclude_unset=True)

    if "username" in update_data:
        existing = await db.users.find_one({"username": update_data["username"], "_id": {"$ne": object_id}})
        if existing:
            raise HTTPException(status_code=400, detail="Username already exists")
    if "password" in update_data:
        update_data["password_hash"] = get_password_hash(update_data.pop("password"))

    result = await db.users.update_one({"_id": object_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    updated = await db.users.find_one({"_id": object_id})
    return serialize_doc(updated)


@router.delete("/{user_id}")
async def delete_user(user_id: str, current_user=Depends(require_admin)):
    db = get_db()
    object_id = parse_object_id(user_id, "User")
    result = await db.users.delete_one({"_id": object_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "User deleted"}

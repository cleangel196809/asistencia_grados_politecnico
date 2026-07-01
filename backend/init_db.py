#!/usr/bin/env python3
"""Initialize the database with default users and indexes."""
import asyncio
import os
from datetime import datetime

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext

load_dotenv()

MONGODB_URL = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
MONGODB_DB = os.getenv("MONGODB_DB", "politecnico_grados")

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

DEFAULT_USERS = [
    {
        "username": "admin",
        "password": "admin123",
        "full_name": "Administrador",
        "role": "admin",
        "active": True,
    },
    {
        "username": "logistico",
        "password": "logis123",
        "full_name": "Logístico",
        "role": "logistico",
        "active": True,
    },
    {
        "username": "scanner",
        "password": "scanner123",
        "full_name": "Scanner",
        "role": "scanner",
        "active": True,
    },
]


async def init_db():
    client = AsyncIOMotorClient(MONGODB_URL)
    db = client[MONGODB_DB]

    print(f"Connecting to MongoDB: {MONGODB_URL}")
    print(f"Database: {MONGODB_DB}")

    for user_data in DEFAULT_USERS:
        existing = await db.users.find_one({"username": user_data["username"]})
        if not existing:
            user_doc = {
                "username": user_data["username"],
                "password_hash": pwd_context.hash(user_data["password"]),
                "full_name": user_data["full_name"],
                "role": user_data["role"],
                "active": user_data["active"],
                "created_at": datetime.utcnow(),
            }
            await db.users.insert_one(user_doc)
            print(f"✓ Created user: {user_data['username']}")
        else:
            print(f"→ User already exists: {user_data['username']}")

    await db.users.create_index("username", unique=True)
    await db.events.create_index("fecha")
    await db.participants.create_index([("evento_id", 1), ("no_documento", 1)], unique=True)
    await db.qr_codes.create_index("qr_id", unique=True)
    await db.qr_codes.create_index([("participante_id", 1), ("numero_boleta", 1)], unique=True)
    await db.qr_codes.create_index("evento_id")
    await db.attendance.create_index("qr_id")
    await db.attendance.create_index("evento_id")

    print("✓ Indexes created")
    print("✓ Database initialization complete!")
    client.close()


if __name__ == "__main__":
    asyncio.run(init_db())

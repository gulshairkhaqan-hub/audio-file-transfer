import os
from pathlib import Path
from dotenv import load_dotenv
import bcrypt
from pydantic import BaseModel
# Explicit path so it works regardless of working directory
load_dotenv(dotenv_path=Path(__file__).parent / ".env", override=True)

from fastapi import FastAPI, UploadFile, File, Form
from fastapi.responses import JSONResponse
from typing import List
from datetime import datetime, timezone
import cloudinary
import cloudinary.uploader
import cloudinary.api
from pymongo import MongoClient

app = FastAPI(title="Audio Transfer Server")

# ── Cloudinary config ──────────────────────────────────────────────────────────
cloudinary.config(
    cloud_name=os.getenv("CLOUDINARY_CLOUD_NAME"),
    api_key=os.getenv("CLOUDINARY_API_KEY"),
    api_secret=os.getenv("CLOUDINARY_API_SECRET"),
    secure=True,
)

# ── MongoDB config ─────────────────────────────────────────────────────────────
mongo_client = MongoClient(os.getenv("MONGODB_URI"))
db = mongo_client["audio_transfer"]
uploads_collection = db["uploads"]
users_collection = db["users"]
UPLOAD_FOLDER = "audio_uploads"

class RegisterRequest(BaseModel):
    name: str
    email: str
    password: str

class LoginRequest(BaseModel):
    email: str
    password: str


@app.get("/")
def home():
    return {"status": "Server is running"}

@app.post("/register")
async def register(data: RegisterRequest):
    # Normalize email
    email = data.email.lower().strip()

    if users_collection.find_one({"email": email}):
        return JSONResponse(status_code=400, content={"error": "Email already registered."})

    hashed = bcrypt.hashpw(data.password.encode("utf-8"), bcrypt.gensalt())

    users_collection.insert_one({
        "name": data.name,
        "email": email,
        "password": hashed.decode("utf-8"),
    })

    return {"message": "Registered successfully!"}


@app.post("/login")
async def login(data: LoginRequest):
    # Normalize email
    email = data.email.lower().strip()

    user = users_collection.find_one({"email": email})
    if not user:
        return JSONResponse(status_code=404, content={"error": "User not found."})

    if not bcrypt.checkpw(data.password.encode("utf-8"), user["password"].encode("utf-8")):
        return JSONResponse(status_code=401, content={"error": "Wrong password."})

    return {
        "message": f"Welcome back, {user['name']}!",
        "name": user["name"],
        "email": email,
    }

@app.post("/receive")
async def receive_files(files: List[UploadFile] = File(...), user_email: str = Form("")):
    saved = []
    for file in files:
        base_name = os.path.splitext(os.path.basename(file.filename))[0]

        # Upload to Cloudinary
        result = cloudinary.uploader.upload(
            file.file,
            resource_type="video",
            folder=UPLOAD_FOLDER,
            public_id=base_name,
            overwrite=False,
        )

        name = f"{base_name}.{result['format']}"
        url  = result["secure_url"]

        # Save record to MongoDB with user_email for ownership tracking
        uploads_collection.update_one(
            {"name": name, "user_email": user_email},
            {"$set": {
                "name": name,
                "url": url,
                "user_email": user_email,
                "uploaded_at": datetime.now(timezone.utc),
            }},
            upsert=True,
        )

        saved.append({"name": name, "url": url})

    return {
        "message": f"{len(saved)} file(s) uploaded to Cloudinary successfully",
        "files": saved,
    }


@app.get("/files")
async def list_files():
    # Cloudinary listing is global — file ownership is tracked via MongoDB uploads_collection,
    # not Cloudinary. Use /history with user_email param for per-user file records.
    try:
        res = cloudinary.api.resources(
            resource_type="video",
            type="upload",
            prefix=f"{UPLOAD_FOLDER}/",
            max_results=100,
        )
        resources = sorted(
            res.get("resources", []),
            key=lambda r: r.get("created_at", ""),
            reverse=True,
        )
        files = [
            {
                "name": f"{r['public_id'].split('/')[-1]}.{r['format']}",
                "url": r["secure_url"],
                "uploaded_at": r.get("created_at", ""),
            }
            for r in resources
        ]
        return {"count": len(files), "files": files}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.get("/history")
async def upload_history(user_email: str = ""):
    """MongoDB se upload history return karo — user_email se filter hoga"""
    try:
        query = {"user_email": user_email} if user_email else {}
        records = list(
            uploads_collection.find(query, {"_id": 0})
            .sort("uploaded_at", -1)
            .limit(100)
        )
        # datetime ko string me convert karo
        for r in records:
            if isinstance(r.get("uploaded_at"), datetime):
                r["uploaded_at"] = r["uploaded_at"].isoformat()
        return {"count": len(records), "history": records}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port)

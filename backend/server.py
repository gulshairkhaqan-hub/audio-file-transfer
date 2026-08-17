import os
import tempfile
import time
from pathlib import Path
from dotenv import load_dotenv
import re
import bcrypt
from pydantic import BaseModel, EmailStr
load_dotenv(dotenv_path=Path(__file__).parent / ".env", override=False)
from fastapi import FastAPI, UploadFile, File, Form, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from typing import List
from datetime import datetime, timezone, timedelta
import cloudinary
import cloudinary.uploader
import cloudinary.api
import requests
from pymongo import MongoClient, ReturnDocument

app = FastAPI(title="VoxClone API")


_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _origins.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

cloudinary.config(
    cloud_name=os.getenv("CLOUDINARY_CLOUD_NAME"),
    api_key=os.getenv("CLOUDINARY_API_KEY"),
    api_secret=os.getenv("CLOUDINARY_API_SECRET"),
    secure=True,
)

mongo_client = MongoClient(os.getenv("MONGODB_URI"))
db = mongo_client["audio_transfer"]
uploads_collection = db["uploads"]
users_collection = db["users"]

# Rate limiting lives in Mongo because Vercel functions are stateless — there's
# no shared in-process memory across invocations. A TTL index auto-expires old
# counter buckets so the collection doesn't grow forever.
rate_limits_collection = db["rate_limits"]
try:
    rate_limits_collection.create_index("expireAt", expireAfterSeconds=0)
except Exception:
    pass

# Heavy (model-calling) endpoints: this many requests per user per window. Keeps
# a runaway client from burning Azure compute credits.
RATE_LIMIT_MAX = 20
RATE_LIMIT_WINDOW_SECONDS = 60

UPLOAD_FOLDER = "audio_uploads"

MODEL_SERVICE_URL = os.getenv("MODEL_SERVICE_URL", "").rstrip("/")
MODEL_API_KEY = os.getenv("MODEL_API_KEY", "")
MODEL_TIMEOUT_SECONDS = 120

VOICES = [
    {"id": "af_heart", "name": "Sophia", "accent": "American", "gender": "female"},
    {"id": "af_bella", "name": "Bella", "accent": "American", "gender": "female"},
    {"id": "bf_emma", "name": "Emma", "accent": "British", "gender": "female"},
    {"id": "af_nicole", "name": "Nicole", "accent": "American", "gender": "female"},
    {"id": "af_aoede", "name": "Aoede", "accent": "American", "gender": "female"},
    {"id": "af_kore", "name": "Kore", "accent": "American", "gender": "female"},
    {"id": "af_sarah", "name": "Sarah", "accent": "American", "gender": "female"},
    {"id": "am_michael", "name": "Michael", "accent": "American", "gender": "male"},
    {"id": "am_fenrir", "name": "Fenrir", "accent": "American", "gender": "male"},
    {"id": "am_puck", "name": "Puck", "accent": "American", "gender": "male"},
    {"id": "af_alloy", "name": "Alloy", "accent": "American", "gender": "female"},
    {"id": "af_nova", "name": "Nova", "accent": "American", "gender": "female"},
    {"id": "bf_isabella", "name": "Isabella", "accent": "British", "gender": "female"},
    {"id": "bm_george", "name": "George", "accent": "British", "gender": "male"},
    {"id": "bm_fable", "name": "Fable", "accent": "British", "gender": "male"},
    {"id": "af_sky", "name": "Sky", "accent": "American", "gender": "female"},
    {"id": "bm_lewis", "name": "Lewis", "accent": "British", "gender": "male"},
    {"id": "af_jessica", "name": "Jessica", "accent": "American", "gender": "female"},
    {"id": "af_river", "name": "River", "accent": "American", "gender": "female"},
    {"id": "am_echo", "name": "Echo", "accent": "American", "gender": "male"},
    {"id": "am_eric", "name": "Eric", "accent": "American", "gender": "male"},
    {"id": "am_liam", "name": "Liam", "accent": "American", "gender": "male"},
    {"id": "am_onyx", "name": "Onyx", "accent": "American", "gender": "male"},
    {"id": "bf_alice", "name": "Alice", "accent": "British", "gender": "female"},
    {"id": "bf_lily", "name": "Lily", "accent": "British", "gender": "female"},
    {"id": "bm_daniel", "name": "Daniel", "accent": "British", "gender": "male"},
    {"id": "am_santa", "name": "Santa", "accent": "American", "gender": "male"},
    {"id": "am_adam", "name": "Adam", "accent": "American", "gender": "male"},

    {"id": "ef_dora", "name": "Dora", "accent": "Spanish", "gender": "female"},
    {"id": "em_alex", "name": "Alex", "accent": "Spanish", "gender": "male"},
    {"id": "em_santa", "name": "Santa", "accent": "Spanish", "gender": "male"},
    {"id": "ff_siwis", "name": "Siwis", "accent": "French", "gender": "female"},
    {"id": "hf_alpha", "name": "Alpha", "accent": "Hindi", "gender": "female"},
    {"id": "hf_beta", "name": "Beta", "accent": "Hindi", "gender": "female"},
    {"id": "hm_omega", "name": "Omega", "accent": "Hindi", "gender": "male"},
    {"id": "hm_psi", "name": "Psi", "accent": "Hindi", "gender": "male"},
    {"id": "if_sara", "name": "Sara", "accent": "Italian", "gender": "female"},
    {"id": "im_nicola", "name": "Nicola", "accent": "Italian", "gender": "male"},
    {"id": "pf_dora", "name": "Dora", "accent": "Portuguese", "gender": "female"},
    {"id": "pm_alex", "name": "Alex", "accent": "Portuguese", "gender": "male"},
    {"id": "pm_santa", "name": "Santa", "accent": "Portuguese", "gender": "male"},
]
VOICE_IDS = {v["id"] for v in VOICES}

MAX_TEXT_CHARS = 2000

MIN_SPEED = 0.5
MAX_SPEED = 2.0


def _clamp_speed(speed: float) -> float:
    try:
        return max(MIN_SPEED, min(MAX_SPEED, float(speed)))
    except (TypeError, ValueError):
        return 1.0


def _client_key(user_email: str, request: Request) -> str:
    """Identify the caller for rate limiting: prefer their email, fall back to IP."""
    email = (user_email or "").strip().lower()
    if email:
        return email
    return request.client.host if request.client else "anon"


def _rate_limited(key: str) -> bool:
    """Fixed-window limiter backed by Mongo. Returns True once `key` has spent
    its budget for the current window.

    ponytail: fixed window (a burst can straddle two windows) + Mongo round-trip
    per call. Fine at this scale; swap for Redis/sliding-window if traffic grows.
    """
    bucket = int(time.time()) // RATE_LIMIT_WINDOW_SECONDS
    try:
        doc = rate_limits_collection.find_one_and_update(
            {"_id": f"{key}:{bucket}"},
            {
                "$inc": {"count": 1},
                "$setOnInsert": {
                    "expireAt": datetime.now(timezone.utc)
                    + timedelta(seconds=RATE_LIMIT_WINDOW_SECONDS * 2)
                },
            },
            upsert=True,
            return_document=ReturnDocument.AFTER,
        )
    except Exception:
        # Never let a limiter hiccup block a real request — fail open.
        return False
    return doc.get("count", 1) > RATE_LIMIT_MAX


def _too_many():
    return JSONResponse(
        status_code=429,
        content={"error": "Too many requests — please wait a minute before generating again."},
    )


class RegisterRequest(BaseModel):
    name: str
    email: EmailStr
    password: str

class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class ChangePasswordRequest(BaseModel):
    email: EmailStr
    old_password: str
    new_password: str


class GenerateRequest(BaseModel):
    voice: str
    text: str
    speed: float = 1.0
    user_email: str = ""


class MixRequest(BaseModel):
    voice_a: str
    voice_b: str
    blend: float = 0.5
    text: str
    speed: float = 1.0
    user_email: str = ""


def _user_prefix(user_email: str) -> str:
    """Sanitize a user email into a safe Cloudinary public_id path segment."""
    return re.sub(r"[^a-zA-Z0-9_.-]", "_", (user_email or "anonymous").lower().strip())


def _validate_text(text: str):
    """Return an error response if `text` isn't usable, else None."""
    if not text or not text.strip():
        return JSONResponse(status_code=400, content={"error": "Please enter some text to speak."})
    if len(text) > MAX_TEXT_CHARS:
        return JSONResponse(
            status_code=400,
            content={"error": f"Text is too long — keep it under {MAX_TEXT_CHARS} characters."},
        )
    return None


def _model_configured() -> bool:
    """True when both the service URL and API key are set."""
    return bool(MODEL_SERVICE_URL and MODEL_API_KEY)


def _request_audio(path: str, *, json=None, data=None, files=None):
    """POST to the model service and save the returned WAV to a temp file.

    Returns the temp file path on success, or a JSONResponse describing the
    failure so callers can just check the type and return it directly.
    """
    if not _model_configured():
        return _space_unavailable()

    try:
        resp = requests.post(
            f"{MODEL_SERVICE_URL}{path}",
            headers={"X-API-Key": MODEL_API_KEY},
            json=json,
            data=data,
            files=files,
            timeout=MODEL_TIMEOUT_SECONDS,
        )
    except requests.RequestException:
        return _space_failed()

    if resp.status_code != 200:

        if resp.status_code == 400:
            try:
                detail = resp.json().get("detail")
            except ValueError:
                detail = None
            if detail:
                return JSONResponse(status_code=400, content={"error": detail})
        return _space_failed()

    with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as f:
        f.write(resp.content)
        return f.name


def _space_unavailable():
    return JSONResponse(
        status_code=503,
        content={"error": "The voice service is not configured yet. Please try again later."},
    )


def _space_failed():
    return JSONResponse(
        status_code=502,
        content={"error": "Voice generation failed. The model service may be starting up — try again in a minute."},
    )


def _store_audio(generated_path: str, user_email: str, kind: str):
    """Upload generated audio to Cloudinary, record it in MongoDB, return its URL.

    Shared by /clone, /generate and /mix. Always removes `generated_path`.
    Returns either a dict payload or a JSONResponse error.
    """
    if not generated_path:
        return _space_failed()

    prefix = _user_prefix(user_email)
    base_name = f"{kind}_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S_%f')}"
    public_id = f"{prefix}/{base_name}"

    try:
        upload_result = cloudinary.uploader.upload(
            generated_path,
            resource_type="video",
            folder=UPLOAD_FOLDER,
            public_id=public_id,
            overwrite=False,
        )
    except Exception:
        return JSONResponse(status_code=500, content={"error": "Could not save the generated audio."})
    finally:
        if generated_path and os.path.exists(generated_path):
            try:
                os.remove(generated_path)
            except OSError:
                pass

    name = f"{base_name}.{upload_result['format']}"
    url = upload_result["secure_url"]
    stored_public_id = upload_result.get("public_id", f"{UPLOAD_FOLDER}/{public_id}")

    uploads_collection.update_one(
        {"name": name, "user_email": user_email},
        {"$set": {
            "name": name,
            "url": url,
            "public_id": stored_public_id,
            "user_email": user_email,
            "kind": kind,
            "uploaded_at": datetime.now(timezone.utc),
        }},
        upsert=True,
    )

    return {"url": url, "name": name}


@app.get("/")
def home():
    return {"status": "Server is running"}


@app.get("/config-check")
def config_check():
    """Shows which origins CORS accepts and whether services are wired.

    Values are never returned — only whether each one is present — so this is
    safe to leave public. Open this in a browser and compare `allowed_origins`
    with the exact frontend URL when the browser reports a CORS failure.
    """
    return {
        "allowed_origins": _origins,
        "mongodb_configured": bool(os.getenv("MONGODB_URI")),
        "cloudinary_configured": bool(os.getenv("CLOUDINARY_CLOUD_NAME")),
        "voice_service_configured": _model_configured(),
    }

@app.post("/register")
async def register(data: RegisterRequest):
    # Normalize email
    email = data.email.lower().strip()

    if len(data.password) < 6:
        return JSONResponse(status_code=400, content={"error": "Password must be at least 6 characters."})

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

    email = data.email.lower().strip()

    user = users_collection.find_one({"email": email})

    if not user or not bcrypt.checkpw(data.password.encode("utf-8"), user["password"].encode("utf-8")):
        return JSONResponse(status_code=401, content={"error": "Invalid email or password."})

    return {
        "message": f"Welcome back, {user['name']}!",
        "name": user["name"],
        "email": email,
    }


@app.post("/change-password")
async def change_password(data: ChangePasswordRequest):
    """Change a user's password after verifying their current one."""
    email = data.email.lower().strip()

    if len(data.new_password) < 6:
        return JSONResponse(status_code=400, content={"error": "New password must be at least 6 characters."})

    user = users_collection.find_one({"email": email})

    if not user or not bcrypt.checkpw(data.old_password.encode("utf-8"), user["password"].encode("utf-8")):
        return JSONResponse(status_code=401, content={"error": "Current password is incorrect."})

    if data.new_password == data.old_password:
        return JSONResponse(status_code=400, content={"error": "New password must differ from the current one."})

    hashed = bcrypt.hashpw(data.new_password.encode("utf-8"), bcrypt.gensalt())
    users_collection.update_one({"email": email}, {"$set": {"password": hashed.decode("utf-8")}})

    return {"message": "Password changed successfully!"}

@app.post("/receive")
async def receive_files(files: List[UploadFile] = File(...), user_email: str = Form("")):
    saved = []
    prefix = _user_prefix(user_email)
    for file in files:
        base_name = os.path.splitext(os.path.basename(file.filename))[0]

        
        public_id = f"{prefix}/{base_name}"

    
        result = cloudinary.uploader.upload(
            file.file,
            resource_type="video",
            folder=UPLOAD_FOLDER,
            public_id=public_id,
            overwrite=False,
        )

        name = f"{base_name}.{result['format']}"
        url  = result["secure_url"]
        stored_public_id = result.get("public_id", f"{UPLOAD_FOLDER}/{public_id}")

        uploads_collection.update_one(
            {"name": name, "user_email": user_email},
            {"$set": {
                "name": name,
                "url": url,
                "public_id": stored_public_id,
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


@app.post("/clone")
async def clone_voice(
    request: Request,
    audio: UploadFile = File(...),
    text: str = Form(...),
    user_email: str = Form(""),
):
    """Voice cloning: forward the sample + text to the model service (Pocket TTS),
    upload the generated audio to Cloudinary, record it, and return the URL."""
    if _rate_limited(f"heavy:{_client_key(user_email, request)}"):
        return _too_many()

    err = _validate_text(text)
    if err:
        return err

    audio_bytes = await audio.read()
    filename = audio.filename or "sample.wav"
    content_type = audio.content_type or "audio/wav"

    result = _request_audio(
        "/clone",
        data={"text": text.strip()},
        files={"audio": (filename, audio_bytes, content_type)},
    )
    if isinstance(result, JSONResponse):
        return result

    return _store_audio(result, user_email, "clone")


@app.post("/generate")
async def generate_voice(data: GenerateRequest, request: Request):
    """Preset-voice generation: call the model service (Kokoro), upload the result."""
    if _rate_limited(f"heavy:{_client_key(data.user_email, request)}"):
        return _too_many()

    err = _validate_text(data.text)
    if err:
        return err

    if data.voice not in VOICE_IDS:
        return JSONResponse(status_code=400, content={"error": "Invalid voice selected."})

    result = _request_audio(
        "/generate",
        json={"voice": data.voice, "text": data.text.strip(), "speed": _clamp_speed(data.speed)},
    )
    if isinstance(result, JSONResponse):
        return result

    return _store_audio(result, data.user_email, "generate")


@app.post("/mix")
async def mix_voices(data: MixRequest, request: Request):
    """Voice mixing: blend two Kokoro voice embeddings and speak `text` in the result."""
    if _rate_limited(f"heavy:{_client_key(data.user_email, request)}"):
        return _too_many()

    err = _validate_text(data.text)
    if err:
        return err

    for v in (data.voice_a, data.voice_b):
        if v not in VOICE_IDS:
            return JSONResponse(status_code=400, content={"error": f"Invalid voice: {v}"})

    if not (0.0 <= data.blend <= 1.0):
        return JSONResponse(status_code=400, content={"error": "Blend must be between 0.0 and 1.0."})

    result = _request_audio(
        "/mix",
        json={
            "voice_a": data.voice_a,
            "voice_b": data.voice_b,
            "blend": data.blend,
            "text": data.text.strip(),
            "speed": _clamp_speed(data.speed),
        },
    )
    if isinstance(result, JSONResponse):
        return result

    return _store_audio(result, data.user_email, "mix")


@app.get("/voices")
async def list_voices():
    """Return the preset voices available for /generate and /mix."""
    return {"voices": VOICES}


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
    """Return upload history from MongoDB, filtered by user_email."""
    try:
        query = {"user_email": user_email} if user_email else {}
        records = list(
            uploads_collection.find(query, {"_id": 0})
            .sort("uploaded_at", -1)
            .limit(100)
        )
        # Convert datetime to ISO string for JSON serialization
        for r in records:
            if isinstance(r.get("uploaded_at"), datetime):
                r["uploaded_at"] = r["uploaded_at"].isoformat()
        return {"count": len(records), "history": records}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.delete("/files/{name}")
async def delete_file(name: str, user_email: str = ""):
    """Delete a file from Cloudinary and MongoDB. Scoped to the owning user."""
    # Ownership check: the record must belong to this user.
    record = uploads_collection.find_one({"name": name, "user_email": user_email})
    if not record:
        return JSONResponse(status_code=404, content={"error": "File not found."})

    public_id = record.get("public_id")
    if not public_id:
        return JSONResponse(
            status_code=400,
            content={"error": "This file predates ownership tracking and can't be deleted here."},
        )

    try:
        cloudinary.uploader.destroy(public_id, resource_type="video", invalidate=True)
        uploads_collection.delete_one({"name": name, "user_email": user_email})
        return {"message": f"'{name}' deleted."}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port)

import os
import tempfile
from pathlib import Path
from dotenv import load_dotenv
import re
import bcrypt
from pydantic import BaseModel, EmailStr
load_dotenv(dotenv_path=Path(__file__).parent / ".env", override=False)
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from typing import List
from datetime import datetime, timezone
import cloudinary
import cloudinary.uploader
import cloudinary.api
from pymongo import MongoClient

app = FastAPI(title="VoxClone API")

# ── CORS ─────────────────────────────────────────────────────────────────────
# Allow the Next.js frontend (local dev + deployed) to call this API from the browser.
# Set ALLOWED_ORIGINS in .env as a comma-separated list for production (Vercel URL).
_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _origins.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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

# ── Model service (HuggingFace Space) config ────────────────────────────────────
# The Space runs Chatterbox (cloning) and Kokoro (presets + blending) and exposes
# a Gradio API. This backend loads no PyTorch — it just forwards HTTP calls, which
# is what keeps it small enough for a serverless deploy. Set HF_SPACE_URL to the
# Space URL, e.g. "https://<user>-voxclone-models.hf.space". HF_TOKEN is only
# needed for a private Space.
HF_SPACE_URL = os.getenv("HF_SPACE_URL", "")
HF_TOKEN = os.getenv("HF_TOKEN") or None

# Preset voices offered by the /generate and /mix features. Must stay in sync
# with VOICES in hf_space/app.py — the Space rejects ids it doesn't know.
VOICES = [
    {"id": "af_heart", "name": "Sophia", "accent": "American", "gender": "female"},
    {"id": "af_bella", "name": "Bella", "accent": "American", "gender": "female"},
    {"id": "am_michael", "name": "Michael", "accent": "American", "gender": "male"},
    {"id": "am_adam", "name": "Adam", "accent": "American", "gender": "male"},
    {"id": "bf_emma", "name": "Emma", "accent": "British", "gender": "female"},
    {"id": "bf_isabella", "name": "Isabella", "accent": "British", "gender": "female"},
    {"id": "bm_george", "name": "George", "accent": "British", "gender": "male"},
    {"id": "bm_lewis", "name": "Lewis", "accent": "British", "gender": "male"},
]
VOICE_IDS = {v["id"] for v in VOICES}

MAX_TEXT_CHARS = 1000


class RegisterRequest(BaseModel):
    name: str
    email: EmailStr
    password: str

class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class GenerateRequest(BaseModel):
    voice: str
    text: str
    user_email: str = ""


class MixRequest(BaseModel):
    voice_a: str
    voice_b: str
    blend: float = 0.5
    text: str
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


def _space_client():
    """Build a gradio_client for the model Space.

    Imported lazily so the app still boots in an environment where the dep is
    missing and no model endpoint is ever called.
    """
    from gradio_client import Client

    return Client(HF_SPACE_URL, hf_token=HF_TOKEN)


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
        "voice_service_configured": bool(HF_SPACE_URL),
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
    # Normalize email
    email = data.email.lower().strip()

    user = users_collection.find_one({"email": email})
    # Use one generic message for both unknown-email and wrong-password
    # so the endpoint doesn't reveal which emails are registered.
    if not user or not bcrypt.checkpw(data.password.encode("utf-8"), user["password"].encode("utf-8")):
        return JSONResponse(status_code=401, content={"error": "Invalid email or password."})

    return {
        "message": f"Welcome back, {user['name']}!",
        "name": user["name"],
        "email": email,
    }

@app.post("/receive")
async def receive_files(files: List[UploadFile] = File(...), user_email: str = Form("")):
    saved = []
    prefix = _user_prefix(user_email)
    for file in files:
        base_name = os.path.splitext(os.path.basename(file.filename))[0]

        # Namespace the public_id per user so files from different users never collide.
        public_id = f"{prefix}/{base_name}"

        # Upload to Cloudinary
        result = cloudinary.uploader.upload(
            file.file,
            resource_type="video",
            folder=UPLOAD_FOLDER,
            public_id=public_id,
            overwrite=False,
        )

        name = f"{base_name}.{result['format']}"
        url  = result["secure_url"]
        # Cloudinary's returned public_id includes the folder; store it so delete can reconstruct it.
        stored_public_id = result.get("public_id", f"{UPLOAD_FOLDER}/{public_id}")

        # Save record to MongoDB with user_email for ownership tracking
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
    audio: UploadFile = File(...),
    text: str = Form(...),
    user_email: str = Form(""),
):
    """Voice cloning: forward the sample + text to the HF Space (Chatterbox),
    upload the generated audio to Cloudinary, record it, and return the URL."""
    if not HF_SPACE_URL:
        return _space_unavailable()

    err = _validate_text(text)
    if err:
        return err

    # Save the uploaded sample to a temp file — gradio_client needs a filepath.
    suffix = os.path.splitext(audio.filename or "")[1] or ".wav"
    tmp_in = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as f:
            f.write(await audio.read())
            tmp_in = f.name

        from gradio_client import handle_file

        client = _space_client()
        result = client.predict(
            handle_file(tmp_in),
            text.strip(),
            api_name="/clone",
        )
        # Gradio returns a local filepath to the generated audio.
        generated_path = result[0] if isinstance(result, (list, tuple)) else result
    except Exception:
        return _space_failed()
    finally:
        if tmp_in and os.path.exists(tmp_in):
            try:
                os.remove(tmp_in)
            except OSError:
                pass

    # Upload the generated audio to Cloudinary and store record in MongoDB.
    return _store_audio(generated_path, user_email, "clone")


@app.post("/generate")
async def generate_voice(data: GenerateRequest):
    """Preset-voice generation: call the HF Space (Kokoro), upload the result."""
    if not HF_SPACE_URL:
        return _space_unavailable()

    err = _validate_text(data.text)
    if err:
        return err

    if data.voice not in VOICE_IDS:
        return JSONResponse(status_code=400, content={"error": "Invalid voice selected."})

    try:
        client = _space_client()
        result = client.predict(data.voice, data.text.strip(), api_name="/generate")
        generated_path = result[0] if isinstance(result, (list, tuple)) else result
    except Exception:
        return _space_failed()

    result = _store_audio(generated_path, data.user_email, "generate")
    return result


@app.post("/mix")
async def mix_voices(data: MixRequest):
    """Voice mixing: blend two Kokoro voice embeddings and speak `text` in the result."""
    if not HF_SPACE_URL:
        return _space_unavailable()

    err = _validate_text(data.text)
    if err:
        return err

    for v in (data.voice_a, data.voice_b):
        if v not in VOICE_IDS:
            return JSONResponse(status_code=400, content={"error": f"Invalid voice: {v}"})

    if not (0.0 <= data.blend <= 1.0):
        return JSONResponse(status_code=400, content={"error": "Blend must be between 0.0 and 1.0."})

    try:
        client = _space_client()
        result = client.predict(
            data.voice_a,
            data.voice_b,
            data.blend,
            data.text.strip(),
            api_name="/mix",
        )
        generated_path = result[0] if isinstance(result, (list, tuple)) else result
    except Exception:
        return _space_failed()

    result = _store_audio(generated_path, data.user_email, "mix")
    return result


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

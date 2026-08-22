import os
import io
import hashlib
import tempfile
import time
from pathlib import Path
from dotenv import load_dotenv
import re
import bcrypt
import jwt
from pydantic import BaseModel, EmailStr
load_dotenv(dotenv_path=Path(__file__).parent / ".env", override=False)
from fastapi import Depends, FastAPI, Header, HTTPException, UploadFile, File, Form, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from starlette.exceptions import HTTPException as StarletteHTTPException
from typing import List
from datetime import datetime, timezone, timedelta
import cloudinary
import cloudinary.uploader
import requests
from pymongo import MongoClient, ReturnDocument

app = FastAPI(title="VoxClone API")


# Every error in this app is shaped {"error": "..."} so the frontend can read one
# field. HTTPException (raised by auth/validation dependencies) defaults to
# {"detail": ...}, so reshape it here instead of at every raise site.
@app.exception_handler(StarletteHTTPException)
async def _http_error_handler(request: Request, exc: StarletteHTTPException):
    return JSONResponse(status_code=exc.status_code, content={"error": exc.detail})


_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000")
# NOTE: CORS is registered further down, *after* the body-size middleware.
# Starlette runs the last-registered middleware outermost, and a response that
# skips CORSMiddleware reaches the browser as an opaque CORS failure instead of
# a readable error — so CORS has to be the outermost layer.

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

# Auth. A missing JWT_SECRET is treated as misconfiguration rather than as
# "no auth needed", so a deploy that forgets the secret fails closed.
JWT_SECRET = os.getenv("JWT_SECRET", "")
JWT_ALGORITHM = "HS256"
JWT_TTL_DAYS = 7
JWT_MIN_SECRET_LEN = 32  # RFC 7518 §3.2 minimum for HS256

if JWT_SECRET and len(JWT_SECRET) < JWT_MIN_SECRET_LEN:
    print(
        f"[auth] WARNING: JWT_SECRET is only {len(JWT_SECRET)} characters — a short "
        f"key can be brute-forced. Use at least {JWT_MIN_SECRET_LEN} "
        "(e.g. `python -c \"import secrets; print(secrets.token_hex(32))\"`).",
        flush=True,
    )

# Voice samples only need to be a few seconds long, and Vercel rejects request
# bodies over ~4.5 MB before our code ever runs — so cap below that and return a
# readable error instead of a platform-level failure.
MAX_UPLOAD_BYTES = 4 * 1024 * 1024
MAX_REQUEST_BYTES = MAX_UPLOAD_BYTES + (256 * 1024)  # + room for the other form fields
ALLOWED_AUDIO_EXTS = {".wav", ".mp3", ".m4a", ".mp4", ".aac", ".ogg", ".oga", ".opus", ".flac", ".webm"}

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


def _password_fingerprint(password_hash: str) -> str:
    """Short, non-reversible tag for a stored bcrypt hash.

    Embedded in each token so changing a password invalidates tokens issued
    against the old one. A digest rather than the hash itself — a JWT payload is
    readable by whoever holds the token, so it must not carry hash material.
    """
    return hashlib.sha256(password_hash.encode("utf-8")).hexdigest()[:16]


def _issue_token(email: str, name: str, password_hash: str) -> str:
    """Sign a bearer token carrying the user's identity."""
    if not JWT_SECRET:
        raise HTTPException(status_code=503, detail="Authentication is not configured on the server.")
    now = datetime.now(timezone.utc)
    return jwt.encode(
        {
            "sub": email,
            "name": name,
            "pv": _password_fingerprint(password_hash),
            "iat": now,
            "exp": now + timedelta(days=JWT_TTL_DAYS),
        },
        JWT_SECRET,
        algorithm=JWT_ALGORITHM,
    )


def current_user(authorization: str = Header(default="")) -> dict:
    """FastAPI dependency: the caller's identity, taken from their signed token.

    This is the *only* trusted source of identity. Never authorize against an
    email supplied in a request body/query — the client controls those.
    """
    if not JWT_SECRET:
        raise HTTPException(status_code=503, detail="Authentication is not configured on the server.")

    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise HTTPException(status_code=401, detail="Please sign in to continue.")

    try:
        payload = jwt.decode(
            token.strip(),
            JWT_SECRET,
            algorithms=[JWT_ALGORITHM],
            # Reject a token that simply omits `exp` rather than trusting it forever.
            options={"require": ["exp", "sub"]},
        )
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Your session has expired — please sign in again.")

    email = (payload.get("sub") or "").lower().strip() if isinstance(payload.get("sub"), str) else ""
    if not email:
        raise HTTPException(status_code=401, detail="Your session is invalid — please sign in again.")

    # Costs one indexed lookup per request, and buys the ability to end a session:
    # changing the password re-fingerprints the account and every older token dies.
    record = users_collection.find_one({"email": email}, {"password": 1, "name": 1})
    if not record or payload.get("pv") != _password_fingerprint(record.get("password", "")):
        raise HTTPException(status_code=401, detail="Your session has expired — please sign in again.")

    return {"email": email, "name": record.get("name") or payload.get("name") or ""}


def _looks_like_audio(head: bytes) -> bool:
    """Sniff container magic bytes so a renamed .exe/.zip can't reach the model."""
    if head[:4] in (b"RIFF", b"OggS", b"fLaC", b"\x1a\x45\xdf\xa3"):
        return True  # wav, ogg/opus, flac, webm/matroska
    if head[:3] == b"ID3":
        return True  # mp3 with a tag
    if head[4:8] == b"ftyp":
        return True  # mp4/m4a/aac
    # Bare MPEG audio frame sync (mp3 with no ID3 tag).
    return len(head) >= 2 and head[0] == 0xFF and (head[1] & 0xE0) == 0xE0


async def _read_audio(upload: UploadFile) -> bytes:
    """Read an uploaded audio file, rejecting anything oversized or non-audio.

    Runs before the model call, so a bad file never costs GPU/CPU time. Note that
    Starlette's multipart parser has already spooled the body by the time this
    runs (to disk past 1 MB) — _cap_body_size is what keeps a huge body from
    getting that far; this re-counts the real bytes in case the header lied.
    """
    ext = os.path.splitext(upload.filename or "")[1].lower()
    if ext not in ALLOWED_AUDIO_EXTS:
        raise HTTPException(
            status_code=400,
            detail="Unsupported file type — upload an MP3, WAV, M4A, OGG, FLAC or WebM audio file.",
        )

    # Browsers report m4a as video/mp4 and sometimes fall back to octet-stream,
    # so treat the content type as a hint and rely on the magic bytes below.
    content_type = (upload.content_type or "").lower()
    if content_type and not content_type.startswith(("audio/", "video/", "application/octet-stream")):
        raise HTTPException(status_code=400, detail="That doesn't look like an audio file.")

    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = await upload.read(1 << 20)
        if not chunk:
            break
        total += len(chunk)
        if total > MAX_UPLOAD_BYTES:
            raise HTTPException(
                status_code=413,
                detail=f"Audio file is too large — keep it under {MAX_UPLOAD_BYTES // (1024 * 1024)} MB "
                       "(a clean ~20 second clip is ideal).",
            )
        chunks.append(chunk)

    audio_bytes = b"".join(chunks)
    if len(audio_bytes) < 1024:
        raise HTTPException(status_code=400, detail="That audio file is empty or corrupted.")
    if not _looks_like_audio(audio_bytes[:16]):
        raise HTTPException(status_code=400, detail="That file isn't valid audio — please upload a real audio clip.")

    # ponytail: size is the proxy for duration — decoding here would mean adding
    # ffmpeg/soundfile to a serverless function. The frontend pre-checks duration,
    # and the model service caps its own work.
    return audio_bytes


@app.middleware("http")
async def _cap_body_size(request: Request, call_next):
    """Reject oversized bodies from the Content-Length header, before FastAPI
    buffers the upload. _read_audio still enforces the real limit for clients
    that lie about (or omit) the header."""
    length = request.headers.get("content-length", "")
    if length.isdigit() and int(length) > MAX_REQUEST_BYTES:
        return JSONResponse(
            status_code=413,
            content={"error": f"Upload is too large — keep audio under {MAX_UPLOAD_BYTES // (1024 * 1024)} MB."},
        )
    return await call_next(request)


# Registered last so it wraps everything above it — every response, including the
# early 413 and any 401 from the auth dependency, must carry CORS headers or the
# browser hides the real status behind a CORS error.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _origins.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _client_ip(request: Request) -> str:
    """Best-effort client IP for throttling endpoints that have no user yet.

    Behind Vercel's proxy `request.client.host` is the proxy itself, so every
    visitor would share one bucket and 20 logins/min would lock out the whole
    app — hence the forwarded header first, with the socket peer only as a
    local-dev fallback.
    """
    forwarded = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
    if forwarded:
        return forwarded
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
    old_password: str
    new_password: str


class GenerateRequest(BaseModel):
    voice: str
    text: str
    speed: float = 1.0


class MixRequest(BaseModel):
    voice_a: str
    voice_b: str
    blend: float = 0.5
    text: str
    speed: float = 1.0


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
        "auth_configured": bool(JWT_SECRET),
    }

@app.post("/register")
async def register(data: RegisterRequest, request: Request):
    # Throttled per IP so nobody can mass-create accounts (each one costs a bcrypt hash).
    if _rate_limited(f"register:{_client_ip(request)}"):
        return _too_many()

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
async def login(data: LoginRequest, request: Request):
    # The password is now the only thing standing between a stranger and the
    # account, so throttle guesses per IP. Each attempt also costs a full bcrypt
    # verification, which is billed compute on a serverless function.
    if _rate_limited(f"login:{_client_ip(request)}"):
        return _too_many()

    email = data.email.lower().strip()

    user = users_collection.find_one({"email": email})

    if not user or not bcrypt.checkpw(data.password.encode("utf-8"), user["password"].encode("utf-8")):
        return JSONResponse(status_code=401, content={"error": "Invalid email or password."})

    return {
        "message": f"Welcome back, {user['name']}!",
        "name": user["name"],
        "email": email,
        # The frontend sends this back as `Authorization: Bearer <token>`; it is
        # what proves who the caller is on every protected route.
        "token": _issue_token(email, user["name"], user["password"]),
    }


@app.post("/change-password")
async def change_password(data: ChangePasswordRequest, user: dict = Depends(current_user)):
    """Change the signed-in user's password after verifying their current one."""
    email = user["email"]

    if len(data.new_password) < 6:
        return JSONResponse(status_code=400, content={"error": "New password must be at least 6 characters."})

    record = users_collection.find_one({"email": email})

    # 400, not 401: a wrong *current* password is a form error, whereas 401 now
    # means "your session is gone" and signs the user out.
    if not record or not bcrypt.checkpw(data.old_password.encode("utf-8"), record["password"].encode("utf-8")):
        return JSONResponse(status_code=400, content={"error": "Current password is incorrect."})

    if data.new_password == data.old_password:
        return JSONResponse(status_code=400, content={"error": "New password must differ from the current one."})

    hashed = bcrypt.hashpw(data.new_password.encode("utf-8"), bcrypt.gensalt())
    users_collection.update_one({"email": email}, {"$set": {"password": hashed.decode("utf-8")}})

    # Every token issued against the old password is now dead (they carry a
    # fingerprint of it), which is the point — "change my password" has to be able
    # to kick out a session someone else is holding. Hand back a fresh token so
    # the device doing the change stays signed in.
    return {
        "message": "Password changed successfully!",
        "token": _issue_token(email, record["name"], hashed.decode("utf-8")),
    }

@app.post("/receive")
async def receive_files(
    files: List[UploadFile] = File(...),
    user: dict = Depends(current_user),
):
    saved = []
    user_email = user["email"]
    # Loops Cloudinary uploads, so it gets the same budget as the model endpoints.
    if _rate_limited(f"heavy:{user_email}"):
        return _too_many()
    prefix = _user_prefix(user_email)
    for file in files:
        audio_bytes = await _read_audio(file)
        base_name = os.path.splitext(os.path.basename(file.filename))[0]


        public_id = f"{prefix}/{base_name}"


        result = cloudinary.uploader.upload(
            io.BytesIO(audio_bytes),
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
    audio: UploadFile = File(...),
    text: str = Form(...),
    user: dict = Depends(current_user),
):
    """Voice cloning: forward the sample + text to the model service (Pocket TTS),
    upload the generated audio to Cloudinary, record it, and return the URL."""
    user_email = user["email"]
    if _rate_limited(f"heavy:{user_email}"):
        return _too_many()

    err = _validate_text(text)
    if err:
        return err

    # Validate the upload before spending model compute on it.
    audio_bytes = await _read_audio(audio)
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
async def generate_voice(data: GenerateRequest, user: dict = Depends(current_user)):
    """Preset-voice generation: call the model service (Kokoro), upload the result."""
    user_email = user["email"]
    if _rate_limited(f"heavy:{user_email}"):
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

    return _store_audio(result, user_email, "generate")


@app.post("/mix")
async def mix_voices(data: MixRequest, user: dict = Depends(current_user)):
    """Voice mixing: blend two Kokoro voice embeddings and speak `text` in the result."""
    user_email = user["email"]
    if _rate_limited(f"heavy:{user_email}"):
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

    return _store_audio(result, user_email, "mix")


@app.get("/voices")
async def list_voices():
    """Return the preset voices available for /generate and /mix."""
    return {"voices": VOICES}


@app.get("/files")
async def list_files(user: dict = Depends(current_user)):
    """List the signed-in user's own files.

    Ownership lives in MongoDB, not Cloudinary — a Cloudinary listing is global
    and would expose every user's audio, so this reads the uploads collection.
    """
    try:
        records = list(
            uploads_collection.find({"user_email": user["email"]}, {"_id": 0, "name": 1, "url": 1, "uploaded_at": 1})
            .sort("uploaded_at", -1)
            .limit(100)
        )
        files = [
            {
                "name": r.get("name", ""),
                "url": r.get("url", ""),
                "uploaded_at": r["uploaded_at"].isoformat()
                if isinstance(r.get("uploaded_at"), datetime)
                else r.get("uploaded_at", ""),
            }
            for r in records
        ]
        return {"count": len(files), "files": files}
    except Exception:
        return JSONResponse(status_code=500, content={"error": "Could not list your files."})


@app.get("/history")
async def upload_history(user: dict = Depends(current_user)):
    """Return the signed-in user's upload history from MongoDB."""
    try:
        records = list(
            uploads_collection.find({"user_email": user["email"]}, {"_id": 0})
            .sort("uploaded_at", -1)
            .limit(100)
        )
        # Convert datetime to ISO string for JSON serialization
        for r in records:
            if isinstance(r.get("uploaded_at"), datetime):
                r["uploaded_at"] = r["uploaded_at"].isoformat()
        return {"count": len(records), "history": records}
    except Exception:
        return JSONResponse(status_code=500, content={"error": "Could not load your history."})


@app.delete("/files/{name}")
async def delete_file(name: str, user: dict = Depends(current_user)):
    """Delete a file from Cloudinary and MongoDB. Scoped to the owning user."""
    user_email = user["email"]
    # Ownership check: the record must belong to the signed-in user.
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
    except Exception:
        return JSONResponse(status_code=500, content={"error": "Could not delete that file."})


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port)

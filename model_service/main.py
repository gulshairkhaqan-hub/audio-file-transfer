"""VoxClone model service — Pocket TTS (cloning) + Kokoro (presets, blending).

A plain REST service, deployed as a container on Azure Container Apps. The
FastAPI backend on Vercel calls these three endpoints over HTTP; keeping the
models here is what lets that backend stay free of PyTorch and small enough
for serverless.

    POST /clone     multipart: audio, text              -> audio/wav
    POST /generate  json: voice, text                   -> audio/wav
    POST /mix       json: voice_a, voice_b, blend, text -> audio/wav
    GET  /health                                        -> {"status": "ok"}

Both models are small (Pocket TTS 100M, Kokoro 82M) and CPU-only — Pocket
TTS's authors measured no speedup from a GPU at batch size 1, so this needs
no GPU hardware.

Models load at import time, not lazily. Container Apps scales this to zero
when idle, so a cold start already pays for a container boot; deferring the
model load would just move that cost into the first user's request instead.
"""
import os
import tempfile
from typing import Annotated

import numpy as np
import soundfile as sf
import torch
from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import FileResponse
from kokoro import KPipeline
from pocket_tts import TTSModel
from pydantic import BaseModel, Field
from starlette.background import BackgroundTask

MAX_TEXT_CHARS = 1000

# Set as an Azure Container Apps secret. Left unset, the service refuses every
# model call — an open endpoint on a public URL would let anyone spend the
# subscription's compute grant.
MODEL_API_KEY = os.getenv("MODEL_API_KEY", "")

# ── Curated preset voices ────────────────────────────────────────────────────
# Kokoro ships 26+ voices; these 8 are the ones the UI offers (4 female,
# 4 male, American + British). Keys are Kokoro's internal voice ids — the
# prefix encodes language ("a" = American, "b" = British) and gender. Must
# stay in sync with VOICES in backend/server.py.
VOICES = {
    "af_heart": "Sophia — American, female",
    "af_bella": "Bella — American, female",
    "am_michael": "Michael — American, male",
    "am_adam": "Adam — American, male",
    "bf_emma": "Emma — British, female",
    "bf_isabella": "Isabella — British, female",
    "bm_george": "George — British, male",
    "bm_lewis": "Lewis — British, male",
}

# Both language pipelines are built up front — VOICES spans American ("a") and
# British ("b"), so building lazily would just move the cost to the first
# request for whichever language wasn't warmed.
_kokoro = {code: KPipeline(lang_code=code) for code in ("a", "b")}

_pocket = TTSModel.load_model()

app = FastAPI(title="VoxClone Model Service")


def require_api_key(x_api_key: Annotated[str | None, Header()] = None) -> None:
    """Reject calls that don't carry the shared key.

    A missing MODEL_API_KEY is treated as misconfiguration rather than as
    "no auth needed", so a deploy that forgets the secret fails closed.
    """
    if not MODEL_API_KEY:
        raise HTTPException(status_code=503, detail="Service is not configured.")
    if x_api_key != MODEL_API_KEY:
        raise HTTPException(status_code=401, detail="Invalid or missing API key.")


auth = [Depends(require_api_key)]


class GenerateRequest(BaseModel):
    voice: str
    text: str = Field(min_length=1, max_length=MAX_TEXT_CHARS)


class MixRequest(BaseModel):
    voice_a: str
    voice_b: str
    blend: float = Field(ge=0.0, le=1.0)
    text: str = Field(min_length=1, max_length=MAX_TEXT_CHARS)


def _clean_text(text: str) -> str:
    """Trim and bound the text. Mirrors _validate_text in backend/server.py."""
    text = (text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Please provide some text to speak.")
    if len(text) > MAX_TEXT_CHARS:
        raise HTTPException(
            status_code=400,
            detail=f"Text is too long — keep it under {MAX_TEXT_CHARS} characters.",
        )
    return text


def _check_voice(voice: str) -> str:
    if voice not in VOICES:
        raise HTTPException(status_code=400, detail=f"Unknown voice: {voice}")
    return voice


def _unlink(path: str) -> None:
    try:
        os.remove(path)
    except OSError:
        pass


def _write_wav(audio, sample_rate: int) -> str:
    """Persist a waveform to a temp .wav and return its path."""
    if isinstance(audio, torch.Tensor):
        audio = audio.detach().cpu().numpy()
    audio = np.asarray(audio, dtype=np.float32).squeeze()
    path = tempfile.NamedTemporaryFile(delete=False, suffix=".wav").name
    sf.write(path, audio, sample_rate)
    return path


def _wav_response(path: str) -> FileResponse:
    """Serve a generated wav, deleting it once the response has been sent."""
    return FileResponse(
        path,
        media_type="audio/wav",
        filename="output.wav",
        background=BackgroundTask(_unlink, path),
    )


def _kokoro_speak(pipeline, text: str, voice) -> str:
    """Run Kokoro and concatenate its chunks into one 24kHz wav.

    `voice` is either a voice id string or a pre-loaded embedding tensor —
    KPipeline accepts both, which is what makes blending possible.
    """
    chunks = [out.audio for out in pipeline(text, voice=voice)]
    if not chunks:
        raise HTTPException(status_code=500, detail="The model produced no audio.")
    return _write_wav(np.concatenate([np.asarray(c).squeeze() for c in chunks]), 24000)


@app.get("/health")
def health() -> dict[str, str]:
    """Unauthenticated so Container Apps health probes can reach it."""
    return {"status": "ok"}


@app.get("/voices", dependencies=auth)
def voices() -> dict[str, str]:
    return VOICES


@app.post("/clone", dependencies=auth)
async def clone(
    audio: Annotated[UploadFile, File()],
    text: Annotated[str, Form()],
) -> FileResponse:
    """Clone the voice in `audio` and speak `text` in it.

    Pocket TTS splits this into two steps: build a "voice state" from the
    sample, then generate against it. The state build is the slow half, and
    it's specific to this upload, so there's nothing to cache across requests.
    """
    text = _clean_text(text)

    suffix = os.path.splitext(audio.filename or "")[1] or ".wav"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as f:
        f.write(await audio.read())
        sample_path = f.name

    try:
        voice_state = _pocket.get_state_for_audio_prompt(sample_path)
        generated = _pocket.generate_audio(voice_state, text)
    finally:
        _unlink(sample_path)

    return _wav_response(_write_wav(generated, _pocket.sample_rate))


@app.post("/generate", dependencies=auth)
def generate(req: GenerateRequest) -> FileResponse:
    voice = _check_voice(req.voice)
    text = _clean_text(req.text)
    return _wav_response(_kokoro_speak(_kokoro[voice[0]], text, voice))


@app.post("/mix", dependencies=auth)
def mix(req: MixRequest) -> FileResponse:
    """Blend two voice embeddings and speak `text` in the result.

    `blend` is voice_a's weight (0.0 = all voice_b, 1.0 = all voice_a). The
    phonemizer comes from voice_a's language since a blend has no single one.
    """
    voice_a = _check_voice(req.voice_a)
    voice_b = _check_voice(req.voice_b)
    text = _clean_text(req.text)

    pipeline = _kokoro[voice_a[0]]
    emb_a = pipeline.load_voice(voice_a)
    emb_b = pipeline.load_voice(voice_b)
    blended = emb_a * req.blend + emb_b * (1.0 - req.blend)

    return _wav_response(_kokoro_speak(pipeline, text, blended))

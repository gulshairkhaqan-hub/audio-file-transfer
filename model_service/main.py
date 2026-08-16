import os
import tempfile
from typing import Annotated

import numpy as np
import soundfile as sf
import torch
from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import FileResponse
from kokoro import KModel, KPipeline
from pocket_tts import TTSModel
from pydantic import BaseModel, Field
from starlette.background import BackgroundTask

MAX_TEXT_CHARS = 1000
MODEL_API_KEY = os.getenv("MODEL_API_KEY", "")
VOICES = {
    "af_heart": "Sophia — American, female",
    "af_bella": "Bella — American, female",
    "bf_emma": "Emma — British, female",
    "af_nicole": "Nicole — American, female",
    "af_aoede": "Aoede — American, female",
    "af_kore": "Kore — American, female",
    "af_sarah": "Sarah — American, female",
    "am_michael": "Michael — American, male",
    "am_fenrir": "Fenrir — American, male",
    "am_puck": "Puck — American, male",
    "af_alloy": "Alloy — American, female",
    "af_nova": "Nova — American, female",
    "bf_isabella": "Isabella — British, female",
    "bm_george": "George — British, male",
    "bm_fable": "Fable — British, male",
    "af_sky": "Sky — American, female",
    "bm_lewis": "Lewis — British, male",
    "af_jessica": "Jessica — American, female",
    "af_river": "River — American, female",
    "am_echo": "Echo — American, male",
    "am_eric": "Eric — American, male",
    "am_liam": "Liam — American, male",
    "am_onyx": "Onyx — American, male",
    "bf_alice": "Alice — British, female",
    "bf_lily": "Lily — British, female",
    "bm_daniel": "Daniel — British, male",
    "am_santa": "Santa — American, male",
    "am_adam": "Adam — American, male",
    "ef_dora": "Dora — Spanish, female",
    "em_alex": "Alex — Spanish, male",
    "em_santa": "Santa — Spanish, male",
    "ff_siwis": "Siwis — French, female",
    "hf_alpha": "Alpha — Hindi, female",
    "hf_beta": "Beta — Hindi, female",
    "hm_omega": "Omega — Hindi, male",
    "hm_psi": "Psi — Hindi, male",
    "if_sara": "Sara — Italian, female",
    "im_nicola": "Nicola — Italian, male",
    "pf_dora": "Dora — Portuguese, female",
    "pm_alex": "Alex — Portuguese, male",
    "pm_santa": "Santa — Portuguese, male",
}
_LANG_CODES = ("a", "b", "e", "f", "h", "i", "p")


def _load_pipelines(codes: tuple[str, ...]) -> dict[str, KPipeline]:

    model = KModel().eval()
    loaded: dict[str, KPipeline] = {}
    for code in codes:
        try:
            loaded[code] = KPipeline(lang_code=code, model=model)
        except Exception as exc: 
            print(f"[kokoro] skipping language '{code}': {exc}", flush=True)
    return loaded


_kokoro = _load_pipelines(_LANG_CODES)
VOICES = {vid: label for vid, label in VOICES.items() if vid and vid[0] in _kokoro}

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
    speed: float = Field(default=1.0, ge=0.5, le=2.0)


class MixRequest(BaseModel):
    voice_a: str
    voice_b: str
    blend: float = Field(ge=0.0, le=1.0)
    text: str = Field(min_length=1, max_length=MAX_TEXT_CHARS)
    speed: float = Field(default=1.0, ge=0.5, le=2.0)


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


def _kokoro_speak(pipeline, text: str, voice, speed: float = 1.0) -> str:
    chunks = [out.audio for out in pipeline(text, voice=voice, speed=speed)]
    if not chunks:
        raise HTTPException(status_code=500, detail="The model produced no audio.")
    return _write_wav(np.concatenate([np.asarray(c).squeeze() for c in chunks]), 24000)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/voices", dependencies=auth)
def voices() -> dict[str, str]:
    return VOICES


@app.post("/clone", dependencies=auth)
async def clone(
    audio: Annotated[UploadFile, File()],
    text: Annotated[str, Form()],
) -> FileResponse:
   
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
    return _wav_response(_kokoro_speak(_kokoro[voice[0]], text, voice, req.speed))


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

    return _wav_response(_kokoro_speak(pipeline, text, blended, req.speed))

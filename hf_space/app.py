"""VoxClone models Space — the app's entire model layer.

Exposes three Gradio endpoints that the FastAPI backend calls via gradio_client:

    /clone     (audio filepath, text)         -> audio filepath   [Pocket TTS]
    /generate  (voice name, text)             -> audio filepath   [Kokoro]
    /mix       (voice a, voice b, blend, text)-> audio filepath   [Kokoro]

Pocket TTS handles voice cloning (needs a sample). Kokoro handles preset
voices and voice blending — it exposes per-voice embedding tensors, so a
genuine blend is just a weighted sum of two of them.

Both models are small (Pocket TTS 100M, Kokoro 82M) and run on CPU. Pocket
TTS's authors report no speedup from a GPU at batch size 1, so this Space
needs no GPU hardware at all.

Models load at import time rather than lazily: Pocket TTS's own docs note that
loading the model and building voice states are both slow, so paying that cost
once at startup keeps every request fast.
"""
import gradio as gr
import numpy as np
import soundfile as sf
import tempfile
import torch
from kokoro import KPipeline
from pocket_tts import TTSModel

# ── ZeroGPU compatibility ────────────────────────────────────────────────────
# Neither model needs a GPU, so CPU Basic is the natural hardware. But a free
# HF account may only be allowed to host ZeroGPU Spaces, and ZeroGPU won't
# schedule a Space that declares no GPU function. The decorator is harmless
# off ZeroGPU — `spaces` returns the function untouched when Config.zero_gpu
# is false, and isn't installed at all when running locally.
#
# Durations are upper bounds, and shorter ones get better queue priority, so
# cloning (which builds a voice state first) gets more room than the two
# Kokoro paths.
try:
    import spaces

    clone_task = spaces.GPU(duration=60)
    speak_task = spaces.GPU(duration=30)
except ImportError:

    def _passthrough(fn):
        return fn

    clone_task = speak_task = _passthrough

# ── Curated preset voices ────────────────────────────────────────────────────
# Kokoro ships 26+ voices; these 8 are the ones the UI offers (4 female,
# 4 male, American + British). Keys are Kokoro's internal voice ids — the
# prefix encodes language ("a" = American, "b" = British) and gender.
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
VOICE_CHOICES = [(label, vid) for vid, label in VOICES.items()]

# Both language pipelines are built up front — VOICES spans American ("a") and
# British ("b"), so building lazily would just move the cost to the first
# request for whichever language wasn't warmed.
_kokoro = {code: KPipeline(lang_code=code) for code in ("a", "b")}

# Pocket TTS ships two sets of weights. The cloning-capable ones live in the
# gated `kyutai/pocket-tts` repo; if that download fails the library quietly
# falls back to `pocket-tts-without-voice-cloning` and only raises later, when
# someone actually submits a sample. Checking here turns that into a startup
# signal: the Space logs say plainly whether /clone will work.
#
# To enable cloning: accept the terms at https://huggingface.co/kyutai/pocket-tts
# and add an HF_TOKEN secret to the Space with read access to that repo.
_pocket = TTSModel.load_model()

if not _pocket.has_voice_cloning:
    print(
        "WARNING: Pocket TTS loaded without voice-cloning weights — /clone will "
        "reject uploads. Accept the terms at https://huggingface.co/kyutai/pocket-tts "
        "and add an HF_TOKEN secret to this Space."
    )


def _write_wav(audio, sample_rate: int) -> str:
    """Persist a waveform to a temp .wav and return its path for Gradio."""
    if isinstance(audio, torch.Tensor):
        audio = audio.detach().cpu().numpy()
    audio = np.asarray(audio, dtype=np.float32).squeeze()
    path = tempfile.NamedTemporaryFile(delete=False, suffix=".wav").name
    sf.write(path, audio, sample_rate)
    return path


def _kokoro_speak(pipeline, text: str, voice) -> str:
    """Run Kokoro and concatenate its chunks into one 24kHz wav.

    `voice` is either a voice id string or a pre-loaded embedding tensor —
    KPipeline accepts both, which is what makes blending possible.
    """
    chunks = [out.audio for out in pipeline(text, voice=voice)]
    if not chunks:
        raise gr.Error("The model produced no audio for that text.")
    return _write_wav(np.concatenate([np.asarray(c).squeeze() for c in chunks]), 24000)


# ── Feature 1: voice cloning ─────────────────────────────────────────────────
@clone_task
def clone(sample_audio, text):
    """Clone the voice in `sample_audio` and speak `text` in it.

    Pocket TTS splits this into two steps: build a "voice state" from the
    sample, then generate against it. The state build is the slow half, but
    it's specific to the uploaded sample so there's nothing to cache across
    requests.
    """
    if not text or not text.strip():
        raise gr.Error("Please provide some text to speak.")
    if sample_audio is None:
        raise gr.Error("Please provide a voice sample.")
    if not _pocket.has_voice_cloning:
        raise gr.Error(
            "Voice cloning is unavailable on this deployment — the Space is "
            "running the model's non-cloning weights. Preset voices and mixing "
            "still work."
        )

    voice_state = _pocket.get_state_for_audio_prompt(sample_audio)
    audio = _pocket.generate_audio(voice_state, text.strip())
    return _write_wav(audio, _pocket.sample_rate)


# ── Feature 2: preset-voice generation ───────────────────────────────────────
@speak_task
def generate(voice, text):
    if not text or not text.strip():
        raise gr.Error("Please provide some text to speak.")
    if voice not in VOICES:
        raise gr.Error(f"Unknown voice: {voice}")

    return _kokoro_speak(_kokoro[voice[0]], text.strip(), voice)


# ── Feature 3: voice mixing ──────────────────────────────────────────────────
@speak_task
def mix(voice_a, voice_b, blend, text):
    """Blend two voice embeddings and speak `text` in the result.

    `blend` is voice_a's weight (0.0 = all voice_b, 1.0 = all voice_a). The
    phonemizer comes from voice_a's language since a blend has no single one.
    """
    if not text or not text.strip():
        raise gr.Error("Please provide some text to speak.")
    for v in (voice_a, voice_b):
        if v not in VOICES:
            raise gr.Error(f"Unknown voice: {v}")

    weight = min(max(float(blend), 0.0), 1.0)
    pipeline = _kokoro[voice_a[0]]

    emb_a = pipeline.load_voice(voice_a)
    emb_b = pipeline.load_voice(voice_b)
    blended = emb_a * weight + emb_b * (1.0 - weight)

    return _kokoro_speak(pipeline, text.strip(), blended)


# ── Gradio interface ─────────────────────────────────────────────────────────
# The api_name values are the contract with the backend — renaming one breaks
# the corresponding endpoint in server.py.
with gr.Blocks(title="VoxClone Models") as demo:
    gr.Markdown(
        "## VoxClone — Model Service\n"
        "API for the VoxClone app. Cloning via Pocket TTS, presets and "
        "blending via Kokoro."
    )

    with gr.Tab("Clone"):
        c_audio = gr.Audio(type="filepath", label="Voice sample")
        c_text = gr.Textbox(label="Text to speak")
        c_out = gr.Audio(label="Cloned voice")
        gr.Button("Clone").click(
            clone, inputs=[c_audio, c_text], outputs=c_out, api_name="clone"
        )

    with gr.Tab("Generate"):
        g_voice = gr.Dropdown(
            choices=VOICE_CHOICES, value="af_heart", label="Voice"
        )
        g_text = gr.Textbox(label="Text to speak")
        g_out = gr.Audio(label="Generated voice")
        gr.Button("Generate").click(
            generate, inputs=[g_voice, g_text], outputs=g_out, api_name="generate"
        )

    with gr.Tab("Mix"):
        m_a = gr.Dropdown(choices=VOICE_CHOICES, value="af_heart", label="Voice A")
        m_b = gr.Dropdown(choices=VOICE_CHOICES, value="bm_george", label="Voice B")
        m_blend = gr.Slider(0.0, 1.0, value=0.5, step=0.05, label="Blend (A weight)")
        m_text = gr.Textbox(label="Text to speak")
        m_out = gr.Audio(label="Mixed voice")
        gr.Button("Mix").click(
            mix, inputs=[m_a, m_b, m_blend, m_text], outputs=m_out, api_name="mix"
        )

if __name__ == "__main__":
    demo.launch()

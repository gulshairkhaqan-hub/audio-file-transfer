"""VoxClone models Space — the app's entire model layer.

Exposes three Gradio endpoints that the FastAPI backend calls via gradio_client:

    /clone     (audio filepath, text)         -> audio filepath   [Chatterbox]
    /generate  (voice name, text)             -> audio filepath   [Kokoro]
    /mix       (voice a, voice b, blend, text)-> audio filepath   [Kokoro]

Chatterbox handles voice cloning (needs a sample). Kokoro handles preset
voices and voice blending — it exposes per-voice embedding tensors, so a
genuine blend is just a weighted sum of two of them.

Models load lazily: importing torch is cheap, but pulling weights is not, and
a Space that loads both at import time takes minutes before it answers
anything. First call to each feature pays the download once.
"""
import gradio as gr
import numpy as np
import soundfile as sf
import tempfile
import torch

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

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

_chatterbox = None
_kokoro = {}  # lang_code -> KPipeline


def _get_chatterbox():
    global _chatterbox
    if _chatterbox is None:
        from chatterbox.tts import ChatterboxTTS

        _chatterbox = ChatterboxTTS.from_pretrained(device=DEVICE)
    return _chatterbox


def _get_kokoro(lang_code: str):
    """One KPipeline per language. Voice ids starting with 'b' are British."""
    if lang_code not in _kokoro:
        from kokoro import KPipeline

        _kokoro[lang_code] = KPipeline(lang_code=lang_code)
    return _kokoro[lang_code]


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
def clone(sample_audio, text):
    if not text or not text.strip():
        raise gr.Error("Please provide some text to speak.")
    if sample_audio is None:
        raise gr.Error("Please provide a voice sample.")

    model = _get_chatterbox()
    wav = model.generate(text.strip(), audio_prompt_path=sample_audio)
    return _write_wav(wav, model.sr)


# ── Feature 2: preset-voice generation ───────────────────────────────────────
def generate(voice, text):
    if not text or not text.strip():
        raise gr.Error("Please provide some text to speak.")
    if voice not in VOICES:
        raise gr.Error(f"Unknown voice: {voice}")

    pipeline = _get_kokoro(voice[0])
    return _kokoro_speak(pipeline, text.strip(), voice)


# ── Feature 3: voice mixing ──────────────────────────────────────────────────
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
    pipeline = _get_kokoro(voice_a[0])

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
        "API for the VoxClone app. Cloning via Chatterbox, presets and "
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

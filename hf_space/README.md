---
title: VoxClone Models
emoji: 🎙️
colorFrom: purple
colorTo: blue
sdk: gradio
sdk_version: 4.44.0
app_file: app.py
pinned: false
---

# VoxClone Models

The model service for the VoxClone app. The FastAPI backend calls these
endpoints through `gradio_client`; the Space is where all the heavy ML
dependencies live, so the backend itself stays deployable on serverless.

| Endpoint | Model | Inputs | Output |
|---|---|---|---|
| `/clone` | Pocket TTS | voice sample, text | audio |
| `/generate` | Kokoro | voice id, text | audio |
| `/mix` | Kokoro | voice a, voice b, blend, text | audio |

`/mix` blends the two voices' embedding tensors (weighted by `blend`, which is
voice A's share) rather than crossfading two renders — the result is one voice
between the two, not two voices at once.

Models load at startup rather than on first use — Pocket TTS's docs note that
both loading the model and building a voice state are slow, so that cost is
paid once during the Space build instead of on the first request.

Both models are small enough to run on CPU: Pocket TTS is 100M parameters and
uses two cores, and its authors report no speedup from a GPU at batch size 1.
Kokoro is 82M. No GPU hardware is needed.

## Enabling voice cloning

`/clone` needs the gated weights from
[`kyutai/pocket-tts`](https://huggingface.co/kyutai/pocket-tts). Accept the
terms there, then add an `HF_TOKEN` secret to this Space with read access.

Without it the library silently falls back to non-cloning weights: the Space
still starts and `/generate` and `/mix` work, but `/clone` rejects uploads.
The startup log says which mode is active.

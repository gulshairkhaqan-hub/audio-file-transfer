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
| `/clone` | Chatterbox | voice sample, text | audio |
| `/generate` | Kokoro | voice id, text | audio |
| `/mix` | Kokoro | voice a, voice b, blend, text | audio |

`/mix` blends the two voices' embedding tensors (weighted by `blend`, which is
voice A's share) rather than crossfading two renders — the result is one voice
between the two, not two voices at once.

Models load lazily on first use, so the first call to each feature is slow
while weights download. On free CPU hardware, expect 30–60s per generation.

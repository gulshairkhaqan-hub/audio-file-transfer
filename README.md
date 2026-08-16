# 🎙️ VoxClone — AI Voice Studio

An ElevenLabs-style AI voice platform. Clone any voice from a short sample,
generate speech in 41 preset voices across 7 languages, or blend two voices
into a new one.

**Live:** https://audio-file-transfer-t68i.vercel.app

---

## ✨ Features

| Feature | What it does | Model |
|---|---|---|
| 🎙️ **Voice Cloning** | Upload a short audio sample + type text → hear the text spoken in that voice | Pocket TTS (100M, kyutai-labs, MIT) |
| 🔊 **Voice Generation** | Pick one of 41 preset voices + type text → get studio-quality audio | Kokoro-82M |
| 🎛️ **Voice Mixing** | Blend two preset voices into a new hybrid voice | Kokoro-82M |

Plus: searchable voice library with HD photos and one-click **▶ previews**,
adjustable speaking speed (0.5×–2×), per-user history, and favourites.

---

## 🏗️ Architecture

Three independently-deployed services:

```
┌──────────────┐   HTTP   ┌──────────────┐   HTTP   ┌────────────────────────┐
│   FRONTEND   │ ───────► │   BACKEND    │ ───────► │     MODEL SERVICE      │
│  Next.js 16  │ ◄─────── │   FastAPI    │ ◄─────── │  FastAPI + PyTorch     │
│   (Vercel)   │          │   (Vercel)   │          │ (Azure Container Apps) │
└──────────────┘          └──────┬───────┘          └────────────────────────┘
                                 │
                    ┌────────────┴────────────┐
                    ▼                          ▼
             ☁️ Cloudinary              🍃 MongoDB Atlas
             (audio files)             (users + history)
```

**Why three services?** The AI models need PyTorch and hold ~GBs in memory, so
they live in a long-running container on Azure Container Apps (scale-to-zero
when idle). The FastAPI backend stays PyTorch-free — small enough to run
serverless on Vercel — and just proxies requests, stores audio on Cloudinary,
and records history in MongoDB. The frontend is a static Next.js app.

---

## 🧰 Tech Stack

- **Frontend:** Next.js 16, React 19, Tailwind CSS v4, TypeScript
- **Backend:** FastAPI, bcrypt (auth), Cloudinary + MongoDB clients
- **Model service:** FastAPI, PyTorch (CPU-only), Pocket TTS, Kokoro
- **Storage:** Cloudinary (audio), MongoDB Atlas (users + history)
- **Hosting:** Vercel (frontend + backend), Azure Container Apps (models)
- **CI/CD:** GitHub Actions → GitHub Container Registry (GHCR) → Azure

---

## 📁 Repository Structure

```
Voice Clonnig App/
├── frontend/               # Next.js app (the UI)
│   └── src/
│       ├── app/            # pages: landing, login, studio/{clone,generate,mix,voices,...}
│       ├── components/     # VoiceSelect, VoiceAvatar, VoicePreviewButton, AudioPlayer, ...
│       └── lib/            # api client, auth, useVoices, favourites, voicePreviews
│
├── backend/                # FastAPI REST API (the proxy + storage layer)
│   ├── server.py           # all endpoints: auth, /generate, /clone, /mix, /voices, history
│   ├── gen_previews.py      # one-time script: build voice preview clips → Cloudinary
│   ├── vercel.json         # Vercel Python build config
│   └── .env.example        # template for required env vars (no real secrets)
│
├── model_service/          # FastAPI + AI models (the brains)
│   ├── main.py             # loads Pocket TTS + Kokoro; /clone /generate /mix
│   └── Dockerfile          # CPU-only container image
│
└── .github/workflows/      # CI: builds the model image and pushes to GHCR
```

---

## 🔌 API Endpoints (backend)

| Endpoint | Method | Description |
|---|---|---|
| `/register`, `/login`, `/change-password` | POST | Account management (bcrypt-hashed passwords) |
| `/generate` | POST | Preset-voice text-to-speech (Kokoro) |
| `/clone` | POST | Clone the uploaded voice and speak text (Pocket TTS) |
| `/mix` | POST | Blend two preset voices and speak text |
| `/voices` | GET | List available preset voices |
| `/history` | GET | Per-user creation history (from MongoDB) |
| `/files/{name}` | DELETE | Delete one of the user's creations (owner only) |
| `/config-check` | GET | Safe health/config check (never returns secret values) |

The model service is protected by an `X-API-Key` header, so only the backend
can spend its compute.

---

## 💻 Local Development

**Prerequisites:** Node.js 20+, Python 3.11+, and a running model service
(Azure) or local model service.

```bash
# 1. Backend
cd backend
pip install -r requirements.txt
cp .env.example .env          # then fill .env with your real values
python server.py              # http://127.0.0.1:8000

# 2. Frontend (new terminal)
cd frontend
npm install
# create frontend/.env.local with:  NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
npm run dev                   # http://localhost:3000
```

> **Secrets:** real credentials live only in `backend/.env` (git-ignored) and
> in the Vercel / Azure dashboards. Never commit `.env`. `.env.example` is only
> a template and must stay free of real values.

---

## 🚀 Deployment

Full step-by-step guide (all three services): see **[DEPLOYMENT.md](DEPLOYMENT.md)**.

Both Vercel projects auto-deploy on every push to `main`. Pushing changes under
`model_service/` triggers a GitHub Action that rebuilds the container image and
pushes it to GHCR, which Azure Container Apps then pulls.

---

## 📄 License

MIT

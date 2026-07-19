---
title: Audio File Transfer Backend
emoji: 🎵
colorFrom: red
colorTo: pink
sdk: docker
app_port: 7860
pinned: false
license: mit
---

# 🎵 Audio File Transfer (FastAPI + Streamlit)

A simple project where a **UI (frontend)** and a **server (backend)** exchange audio files using Cloudinary for storage and MongoDB for history.

## Stack
- **Backend:** FastAPI + Uvicorn
- **Storage:** Cloudinary
- **Database:** MongoDB Atlas
- **Frontend:** Streamlit (separate Space)

## API Endpoints
| Endpoint | Method | Description |
|---|---|---|
| `/` | GET | Health check |
| `/receive` | POST | Upload audio files to Cloudinary |
| `/files` | GET | List all files from Cloudinary |
| `/history` | GET | Upload history from MongoDB |

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
| `/register` | POST | Create a new user account |
| `/login` | POST | Authenticate a user |
| `/receive` | POST | Upload audio files to Cloudinary (namespaced per user) |
| `/files` | GET | List all files from Cloudinary |
| `/history` | GET | Upload history from MongoDB (filtered by `user_email`) |
| `/files/{name}` | DELETE | Delete a file from Cloudinary + MongoDB (owner only) |

## Configuration
Set the following environment variables (see `.env`):
`CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`,
`MONGODB_URI`, `SERVER_URL`. The deploy platform injects `PORT`; the Docker image
defaults to `7860` when `PORT` is not set.

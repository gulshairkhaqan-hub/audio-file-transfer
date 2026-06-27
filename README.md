# 🎵 Audio File Transfer (FastAPI + Streamlit)

Ek simple project jisme ek **UI (frontend)** aur ek **server (backend)** aapas mein
audio files exchange karte hain.

## Files ka maqsad (har file kyun hai?)

| File | Kya hai | Kyun bani / Kis kaam aati hai |
|------|---------|-------------------------------|
| `server.py` | **Backend (FastAPI)** | File receive (`/receive`) aur send (`/send`) karta hai. Ye asal "kaam" karta hai. |
| `app.py` | **Frontend (Streamlit)** | Buttons aur text wala UI. User isse interact karta hai, ye peeche server se baat karta hai. |
| `requirements.txt` | **Dependencies list** | Project chalane ke liye zaroori libraries. Ek command se sab install ho jati hain. |
| `uploads/` | **Storage folder** | Server pe upload hui files yahan save hoti hain (apne aap ban jaata hai). |

## Flow (kaam kaise hota hai?)

```
SECTION 1 (Upload):
  UI: file choose -> "Upload to Server" button
       -> POST /receive -> server file save karta hai
       -> "received successfully" text dikhta hai

SECTION 2 (Download):
  UI: "Request from Server" button
       -> GET /send -> server file wapas bhejta hai
       -> "File received!" text update + audio play
```

## Chalane ka tareeqa (2 terminals chahiye)

**Terminal 1 — Server start karo:**
```cmd
uvicorn server:app --reload --port 8000
```

**Terminal 2 — UI start karo:**
```cmd
streamlit run app.py
```

Pehli dafa? Pehle dependencies install karo:
```cmd
pip install -r requirements.txt
```

## Test karne ka tareeqa
1. Section 1 mein ek `.mp3` file upload karo -> success message aana chahiye.
2. Section 2 mein "Request from Server" dabao -> wohi file wapas mil jayegi aur play hogi.

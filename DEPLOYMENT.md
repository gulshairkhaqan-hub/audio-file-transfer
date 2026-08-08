# VoxClone Deployment Guide

Yeh app **3 separate services** pe deploy hoti hai:

```
┌─────────────┐      ┌─────────────┐      ┌──────────────────┐
│  Frontend   │ ───► │   Backend   │ ───► │  Model Service   │
│  (Next.js)  │      │  (FastAPI)  │      │  (HF Space)      │
│   Vercel    │      │   Vercel    │      │  HuggingFace     │
└─────────────┘      └─────────────┘      └──────────────────┘
```

Teeno **free tier pe chal sakte hain**. Card sirf HuggingFace ke account verification ke liye chahiye ho sakta hai — is guide me **koi paid upgrade nahi** hai, aur free tier cross karne pe HF wait karata hai, bill nahi bhejta.

---

## Part 1 — HuggingFace Space (Model Service)

### 1.1 Space banayein

1. [huggingface.co/new-space](https://huggingface.co/new-space) pe jayein
2. Settings:
   - **Space name**: `voxclone-models` (ya koi bhi naam)
   - **SDK**: Gradio
   - **Hardware**: **CPU basic (free)** try karein
   - **Visibility**: Public (private me HF_TOKEN chahiye)

⚠️ **Agar CPU basic option na mile ya paid plan maange:** HF ne free accounts ke liye Gradio Space creation restrict kar diya hai — us soorat me **ZeroGPU** select karein, wo bhi free hai. Iske liye account "good standing" me hona chahiye: **email verified** aur **account 30 din se purana**.

`app.py` dono hardware pe chalta hai — usme `@spaces.GPU` decorators lage hain jo CPU pe khud-ba-khud no-op ho jate hain, to koi code change nahi karna padega.

### 1.2 Voice cloning enable karein (zaroori)

Pocket TTS ke cloning weights **gated repo** me hain. Bina iske Space chalega, lekin `/clone` upload reject karega (generate + mix theek chalenge).

1. [huggingface.co/kyutai/pocket-tts](https://huggingface.co/kyutai/pocket-tts) pe jaake **terms accept** karein
2. [Settings → Access Tokens](https://huggingface.co/settings/tokens) se ek **read** token banayein
3. Space me **Settings → Variables and secrets → New secret**:
   - Name: `HF_TOKEN`
   - Value: apna token

⚠️ Token ko kabhi code me na likhein — sirf Space secret ke tor pe daalein.

Space ke **Logs** me confirm karein: agar `WARNING: Pocket TTS loaded without voice-cloning weights` dikhe to token missing hai ya terms accept nahi hue.

### 1.3 Files upload karein

Space ke **Files** tab me jaake yeh 4 files upload karein (repo ke `hf_space/` folder se):

- `app.py`
- `requirements.txt`
- `packages.txt`
- `README.md`

Ya git se push:
```bash
git clone https://huggingface.co/spaces/<username>/voxclone-models
cd voxclone-models
cp ../Voice\ Clonnig\ App/hf_space/* .
git add .
git commit -m "Initial commit"
git push
```

### 1.4 Build hone dein

- Pehli baar 10-15 min lagenge (models download hote hain)
- Build complete hone ke baad Space ka URL milega:
  ```
  https://<username>-voxclone-models.hf.space
  ```
- Yeh URL **backend me use hoga**

**Models aur speed:**

| Feature | Model | Size |
|---|---|---|
| Cloning | Pocket TTS (kyutai-labs, MIT) | 100M params |
| Generate / Mix | Kokoro | 82M params |

Dono chhote models hain aur **CPU pe theek chalte hain** — Pocket TTS ke authors ne khud likha hai ke GPU se koi speedup nahi milta (batch size 1 pe), aur wo sirf 2 CPU cores use karta hai (~6x real-time). Models startup pe load hote hain, isliye Space build ke baad requests fast hoti hain.

⚠️ **Free tier ki limitations:**
- Free hardware pe Space **48 hours idle** rehne ke baad sleep mode me chala jata hai — pehli request ke baad wake ho jayega
- ZeroGPU use kar rahe hain to free account ko **5 min/day GPU quota** milta hai (sirf execution time count hota hai, idle nahi)


---

## Part 2 — Backend (FastAPI on Vercel)

### 2.1 MongoDB Atlas setup

1. [mongodb.com/cloud/atlas/register](https://www.mongodb.com/cloud/atlas/register) pe free account banayein
2. **Create Cluster** → M0 (free tier)
3. **Database Access** → Add user (username + password save karein)
4. **Network Access** → Add IP Address → `0.0.0.0/0` (allow all)
5. **Connect** → Drivers → connection string copy karein:
   ```
   mongodb+srv://<user>:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```

### 2.2 Cloudinary setup

1. [cloudinary.com/users/register_free](https://cloudinary.com/users/register_free) pe free account
2. Dashboard se yeh 3 values copy karein:
   - Cloud name
   - API Key
   - API Secret

### 2.3 Vercel pe backend deploy

1. [vercel.com](https://vercel.com) pe login karein (GitHub account se)
2. **Add New** → **Project** → apna GitHub repo select karein
3. **Root Directory** ko change karein: `backend`
4. **Environment Variables** daalein:

   | Variable | Value |
   |---|---|
   | `MONGODB_URI` | `mongodb+srv://...` (Atlas se) |
   | `CLOUDINARY_CLOUD_NAME` | (Dashboard se) |
   | `CLOUDINARY_API_KEY` | (Dashboard se) |
   | `CLOUDINARY_API_SECRET` | (Dashboard se) |
   | `HF_SPACE_URL` | `https://<username>-voxclone-models.hf.space` |
   | `ALLOWED_ORIGINS` | `http://localhost:3000` (abhi frontend local hai) |

5. **Deploy** button dabayein

Backend URL milega:
```
https://voxclone-backend.vercel.app
```

### 2.4 CORS theek karein (baad me)

Jab frontend deploy ho jaye, Vercel dashboard me wapas jayein aur `ALLOWED_ORIGINS` me frontend ka URL add karein:
```
http://localhost:3000,https://your-frontend.vercel.app
```

---

## Part 3 — Frontend (Next.js on Vercel)

### 3.1 Vercel pe frontend deploy

1. [vercel.com](https://vercel.com) pe **Add New** → **Project**
2. Same repo select karein
3. **Root Directory** ko change karein: `frontend`
4. **Environment Variables**:

   | Variable | Value |
   |---|---|
   | `NEXT_PUBLIC_API_URL` | Backend URL (`https://voxclone-backend.vercel.app`) |

5. **Deploy**

Frontend URL milega:
```
https://voxclone.vercel.app
```

### 3.2 Backend CORS update

Backend ke Vercel dashboard me jayein → **Settings** → **Environment Variables** → `ALLOWED_ORIGINS` edit karke frontend URL add karein:
```
http://localhost:3000,https://voxclone.vercel.app
```

**Redeploy** button dabayein (settings save karne ke baad).

---

## Testing

1. Frontend URL kholen: `https://voxclone.vercel.app`
2. **Register** → account banayein
3. **Login** karein
4. **Studio → Clone** pe jayein aur ek audio file upload karein

Agar pehli request pe HF Space error aaye ("The model service may be starting up"), **1 minute wait karke retry** karein — Space cold start ho raha hoga.

---

## Troubleshooting

### Backend pe 500 error

- Vercel dashboard → **Deployments** → latest deployment → **Functions** tab → logs dekhein
- MongoDB URI sahi hai? (Atlas me network access `0.0.0.0/0` allow hai?)
- Cloudinary credentials valid hain?

### HF Space timeout ya slow

- Space 48h se idle tha to pehli request wake-up me lagti hai — 1 min wait karke retry karein
- Space URL browser me khol ke check karein ke wo live hai
- Space ka "Logs" tab dekhein — build fail to nahi hui?
- ZeroGPU pe hain aur "quota exceeded" aaye to daily 5 min khatam ho chuke hain (24h baad reset)

### Demo se pehle (ehm)

- Meet se **10 min pehle** ek generation chala lein — Space warm ho jayega
- Backup ke tor pe local ready rakhein: `cd hf_space && pip install -r requirements.txt && python app.py`

### CORS error (browser console me)

- Backend ke `ALLOWED_ORIGINS` me frontend ka **exact URL** add karein (trailing slash mat dena)
- Backend redeploy karein

---

## Cost Estimate (Monthly)

| Service | Free tier limit | Paid tier (agar cross ho) |
|---|---|---|
| **HF Space (CPU basic)** | Always free (48h idle pe sleep) | CPU upgrade: $0.03/hr |
| **HF Space (ZeroGPU)** | Free, 5 min/day GPU quota | PRO $9/mo (8x quota) |
| **Vercel (Frontend)** | 100 GB bandwidth | Pro: $20/mo |
| **Vercel (Backend)** | 100 GB-hrs serverless | Pro: $20/mo |
| **MongoDB Atlas** | 512 MB storage | Shared: $9/mo |
| **Cloudinary** | 25 GB storage, 25 GB bandwidth | Plus: $99/mo |

⚠️ **Jab tak normal hobbyist traffic hai, sab kuch free me chal jayega.** HF pe paisa tabhi katta hai jab aap PRO subscribe karein **aur** khud manually pre-paid credits add karein — free account pe quota khatam hone pe bas wait karna padta hai.

---

## Next Steps (Optional)

1. **Custom domain**: Vercel me Settings → Domains → apna domain add karein
2. **GPU upgrade**: HF Space me Settings → Hardware → T4 GPU (paid, faster)
3. **Analytics**: Vercel Analytics enable karein (free)
4. **Error tracking**: Sentry integrate karein

**GitHub repo public hai to Vercel auto-deploy karega** har commit pe. 🚀

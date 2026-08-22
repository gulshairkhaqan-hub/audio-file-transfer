# 🚀 VoxClone Deployment Guide

Yeh app **3 alag services** se banti hai. Teeno ko alag deploy karna hota hai:

| # | Service | Kahan chalti hai | Kya karti hai |
|---|---|---|---|
| 1 | **Model Service** | Azure Container Apps | AI models (Pocket TTS + Kokoro) — asli awaaz banati hai |
| 2 | **Backend** | Vercel | FastAPI — requests proxy karta hai, audio store karta hai |
| 3 | **Frontend** | Vercel | Next.js — user jo screen dekhta hai |

Deploy order: **pehle Model Service → phir Backend → phir Frontend.** (Backend
ko model service ka URL chahiye, frontend ko backend ka URL chahiye.)

---

## 🧩 Part 1 — Model Service (Azure Container Apps)

Models bhaari hain (PyTorch, ~GBs RAM) — inhe Vercel pe nahi chala sakte. Isliye
yeh ek **Docker container** me Azure Container Apps pe chalte hain, **scale-to-zero**
ke saath (idle ho to 0 replicas → koi credit kharch nahi).

### 1.1 Image kaise banti hai (automatic)

Azure free-trial khud Docker image build nahi kar sakta. Isliye image
**GitHub Actions** banata hai (GitHub ke free runners pe) aur **GHCR** (GitHub
Container Registry) pe push kar deta hai. Yeh `.github/workflows/build-model.yml`
me set hai — jab bhi `model_service/**` me kuch change ho ke `main` pe push ho,
image dobara ban ke `ghcr.io/<owner>/voxclone-models:latest` pe chali jaati hai.

**Ek dafa karna:** GHCR package ko **public** karo taake Azia bina password ke
pull kar sake:
> GitHub → apni profile → **Packages** → `voxclone-models` → **Package settings**
> → **Change visibility** → **Public**.

### 1.2 Azure pe deploy (ek dafa setup)

[Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli) install
karke terminal me:

```bash
# 1) Login
az login

# 2) Naam / settings (apne hisaab se badal sakte ho)
RG=voxclone-rg
ENV=voxclone-env
APP=voxclone-models
LOCATION=eastus
IMAGE=ghcr.io/<owner>/voxclone-models:latest   # <owner> = tumhara GitHub username

# 3) Resource group + Container Apps environment banao
az group create --name $RG --location $LOCATION
az containerapp env create --name $ENV --resource-group $RG --location $LOCATION

# 4) Container app banao (public GHCR image se)
az containerapp create \
  --name $APP \
  --resource-group $RG \
  --environment $ENV \
  --image $IMAGE \
  --target-port 8000 \
  --ingress external \
  --min-replicas 0 \
  --max-replicas 1 \
  --cpu 2.0 --memory 4.0Gi \
  --secrets model-api-key=<KOI_LAMBA_RANDOM_KEY> hf-token=<TUMHARA_HF_TOKEN> \
  --env-vars MODEL_API_KEY=secretref:model-api-key HF_TOKEN=secretref:hf-token
```

- `MODEL_API_KEY` = koi lamba random secret (tum banao). Yehi key backend me bhi
  daalni hai — takki sirf tumhara backend model service ko call kar sake.
- `HF_TOKEN` = HuggingFace token (models download karne ke liye).
- `--min-replicas 0` = **scale-to-zero** (idle pe credit bachao).

Deploy hone ke baad Azure ek **URL** dega, jaisa:
```
https://voxclone-models.<random>.eastus.azurecontainerapps.io
```
Yeh URL note kar lo — Part 2 me `MODEL_SERVICE_URL` me jaayega.

### 1.3 Baad me code update karne pe

`model_service/` me change push karo → GitHub Action nayi image GHCR pe daal dega.
Phir Azure ko nayi image kheenchne ke liye:

```bash
az containerapp update --name $APP --resource-group $RG --image $IMAGE
```

---

## 🧩 Part 2 — Backend (FastAPI on Vercel)

### 2.1 MongoDB Atlas (users + history)

1. [mongodb.com/atlas](https://www.mongodb.com/atlas) pe free **M0** cluster banao.
2. **Database Access** → ek user banao (username + password).
3. **Network Access** → `0.0.0.0/0` allow karo (Vercel kahin se bhi connect kare).
4. **Connect → Drivers** se connection string copy karo:
   `mongodb+srv://<user>:<password>@<cluster>/?retryWrites=true&w=majority`

### 2.2 Cloudinary (audio files)

1. [cloudinary.com](https://cloudinary.com) pe free account banao.
2. Dashboard se **Cloud name**, **API Key**, **API Secret** copy karo.

### 2.3 Vercel pe deploy

1. [vercel.com](https://vercel.com) pe GitHub repo import karo.
2. **Root Directory = `backend`** set karo.
3. **Environment Variables** me yeh sab daalo:

| Variable | Value |
|---|---|
| `MONGODB_URI` | Atlas connection string (step 2.1) |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name |
| `CLOUDINARY_API_KEY` | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret |
| `MODEL_SERVICE_URL` | Azure model service URL (Part 1.2 wala) |
| `MODEL_API_KEY` | **Wohi** key jo Azure me daali thi (Part 1.2) |
| `JWT_SECRET` | Login tokens sign karne ki key — apni banao: `python -c "import secrets; print(secrets.token_hex(32))"` |
| `ALLOWED_ORIGINS` | Frontend URL (Part 3 ke baad set/update karna) |

4. Deploy karo. Backend URL milega, jaisa `https://<project>.vercel.app`.
5. Check: `https://<backend>/config-check` khol ke dekho sab keys `true` aa rahi hain
   (yeh sirf batata hai key set hai ya nahi — asli value kabhi nahi dikhata).

---

## 🧩 Part 3 — Frontend (Next.js on Vercel)

1. Vercel pe **same repo** dobara import karo (naya project).
2. **Root Directory = `frontend`** set karo.
3. **Environment Variable**:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | Backend ka URL (Part 2 wala) |

4. Deploy karo → frontend URL milega (yehi asli app hai).
5. **Wapas jao Part 2 ke `ALLOWED_ORIGINS`** me yeh frontend URL daal do (CORS ke
   liye), warna browser backend ko block kar dega. Comma se multiple bhi de sakte ho:
   `https://<frontend>.vercel.app`

---

## 🔐 Environment Variables — poori list

**Backend (Vercel):**
```
MONGODB_URI=...
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
MODEL_SERVICE_URL=https://voxclone-models.<...>.azurecontainerapps.io
MODEL_API_KEY=<same-as-azure>
JWT_SECRET=<64-char random hex, apni banao>
ALLOWED_ORIGINS=https://<frontend>.vercel.app
```

> `JWT_SECRET` set na ho to backend jaan-boojh ke **saare logins block** kar dega
> (503) — aadhi-adhoori security se better hai ke saaf fail ho. Isko badalne se
> sab users logout ho jayenge (naye tokens purane se match nahi karenge).

**Frontend (Vercel):**
```
NEXT_PUBLIC_API_URL=https://<backend>.vercel.app
```

**Model Service (Azure Container App):**
```
MODEL_API_KEY=<same-as-backend>
HF_TOKEN=<huggingface-token>
```

> ⚠️ **Secrets kabhi git me commit mat karna.** Local pe yeh `backend/.env` me
> rehte hain (git-ignored). `backend/.env.example` sirf template hai — usme asli
> value kabhi nahi. Production ki asli values sirf Vercel / Azure dashboard me.

---

## 💰 Cost / Credits bachana

- Model service `--min-replicas 0` pe hai → koi request na ho to Azure use nahi
  hoti (credit save). Pehli request pe container jaagta hai (thoda cold-start lag).
- Backend + frontend Vercel ke free tier pe hain.
- Fizool ka bill rokne ke liye Azure me **spending limit / budget alert** laga do.

---

## 🎙️ Voice Previews (optional, ek dafa)

Voice cards pe ▶ preview clips **pehle se bane hue** (Cloudinary pe) hain, taake
playback pe koi Azure compute kharch na ho. Naye voices add karo to dobara banane
ke liye:

```bash
cd backend
python gen_previews.py     # sab voices ke clips Cloudinary pe daal ke
                           # frontend/src/lib/voicePreviews.ts likh deta hai
```
(Iske liye local `backend/.env` bhara hona chahiye + model service chalu ho.)

---

## 🩺 Troubleshooting

| Problem | Wajah / Fix |
|---|---|
| Frontend pe "network / CORS error" | Backend ke `ALLOWED_ORIGINS` me frontend URL nahi hai → add karo |
| Backend `/config-check` me koi key `false` | Woh env var Vercel me set nahi → daal ke redeploy |
| Model calls fail (401 / unauthorized) | Backend aur Azure ki `MODEL_API_KEY` **same** honi chahiye |
| Pehli request slow | Scale-to-zero cold start — normal hai, doosri request fast |
| Azure image update nahi ho rahi | `az containerapp update --image ...` chalao (Part 1.3) |
```

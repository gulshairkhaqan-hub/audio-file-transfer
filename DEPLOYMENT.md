# VoxClone Deployment Guide

Yeh app **3 separate services** pe deploy hoti hai:

```
┌─────────────┐      ┌─────────────┐      ┌──────────────────┐
│  Frontend   │ ───► │   Backend   │ ───► │  Model Service   │
│  (Next.js)  │      │  (FastAPI)  │      │  (HF Space)      │
│   Vercel    │      │   Vercel    │      │  HuggingFace     │
└─────────────┘      └─────────────┘      └──────────────────┘
```

Teeno **free tier pe chal sakte hain, credit card nahi chahiye** (HF Space ka GPU upgrade na karein to).

---

## Part 1 — HuggingFace Space (Model Service)

### 1.1 Space banayein

1. [huggingface.co/new-space](https://huggingface.co/new-space) pe jayein
2. Settings:
   - **Space name**: `voxclone-models` (ya koi bhi naam)
   - **SDK**: Gradio
   - **Hardware**: CPU basic (free)
   - **Visibility**: Public (private me HF_TOKEN chahiye)

### 1.2 Files upload karein

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

### 1.3 Build hone dein

- Pehli baar 10-15 min lagenge (models download hote hain)
- Build complete hone ke baad Space ka URL milega:
  ```
  https://<username>-voxclone-models.hf.space
  ```
- Yeh URL **backend me use hoga**

⚠️ **Free CPU pe limitations:**
- Cloning/generation me 30-60 sec lag sakte hain
- 48 hours idle rehne ke baad Space sleep mode me chala jata hai
- Pehli request slow hogi (cold start), phir thik ho jayega

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

### HF Space timeout

- Space free CPU pe chal raha hai to 60s+ lag sakte hain
- Space URL browser me khol ke check karein ke wo live hai
- Space ka "Logs" tab dekhein

### CORS error (browser console me)

- Backend ke `ALLOWED_ORIGINS` me frontend ka **exact URL** add karein (trailing slash mat dena)
- Backend redeploy karein

---

## Cost Estimate (Monthly)

| Service | Free tier limit | Paid tier (agar cross ho) |
|---|---|---|
| **HF Space (CPU)** | Always free (with 48h sleep) | GPU: $0.60/hr (~$450/mo) |
| **Vercel (Frontend)** | 100 GB bandwidth | Pro: $20/mo |
| **Vercel (Backend)** | 100 GB-hrs serverless | Pro: $20/mo |
| **MongoDB Atlas** | 512 MB storage | Shared: $9/mo |
| **Cloudinary** | 25 GB storage, 25 GB bandwidth | Plus: $99/mo |

⚠️ **Jab tak normal hobbyist traffic hai, sab kuch free me chal jayega.**

---

## Next Steps (Optional)

1. **Custom domain**: Vercel me Settings → Domains → apna domain add karein
2. **GPU upgrade**: HF Space me Settings → Hardware → T4 GPU (paid, faster)
3. **Analytics**: Vercel Analytics enable karein (free)
4. **Error tracking**: Sentry integrate karein

**GitHub repo public hai to Vercel auto-deploy karega** har commit pe. 🚀

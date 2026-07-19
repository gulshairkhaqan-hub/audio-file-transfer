import os
from pathlib import Path
from dotenv import load_dotenv

# Explicit path so it works regardless of working directory
load_dotenv(dotenv_path=Path(__file__).parent / ".env", override=True)

from fastapi import FastAPI, UploadFile, File
from fastapi.responses import JSONResponse
from typing import List
from datetime import datetime, timezone
import cloudinary
import cloudinary.uploader
import cloudinary.api
from pymongo import MongoClient

app = FastAPI(title="Audio Transfer Server")

# ── Cloudinary config ──────────────────────────────────────────────────────────
cloudinary.config(
    cloud_name=os.getenv("CLOUDINARY_CLOUD_NAME"),
    api_key=os.getenv("CLOUDINARY_API_KEY"),
    api_secret=os.getenv("CLOUDINARY_API_SECRET"),
    secure=True,
)

# ── MongoDB config ─────────────────────────────────────────────────────────────
mongo_client = MongoClient(os.getenv("MONGODB_URI"))
db = mongo_client["audio_transfer"]
uploads_collection = db["uploads"]

UPLOAD_FOLDER = "audio_uploads"


@app.get("/")
def home():
    return {"status": "Server is running"}


@app.post("/receive")
async def receive_files(files: List[UploadFile] = File(...)):
    saved = []
    for file in files:
        base_name = os.path.splitext(os.path.basename(file.filename))[0]

        # Upload to Cloudinary
        result = cloudinary.uploader.upload(
            file.file,
            resource_type="video",
            folder=UPLOAD_FOLDER,
            public_id=base_name,
            overwrite=False,
        )

        name = f"{base_name}.{result['format']}"
        url  = result["secure_url"]

        # Save record to MongoDB
        uploads_collection.update_one(
            {"name": name},
            {"$set": {
                "name": name,
                "url": url,
                "uploaded_at": datetime.now(timezone.utc),
            }},
            upsert=True,
        )

        saved.append({"name": name, "url": url})

    return {
        "message": f"{len(saved)} file(s) uploaded to Cloudinary successfully",
        "files": saved,
    }


@app.get("/files")
async def list_files():
    try:
        res = cloudinary.api.resources(
            resource_type="video",
            type="upload",
            prefix=f"{UPLOAD_FOLDER}/",
            max_results=100,
        )
        resources = sorted(
            res.get("resources", []),
            key=lambda r: r.get("created_at", ""),
            reverse=True,
        )
        files = [
            {
                "name": f"{r['public_id'].split('/')[-1]}.{r['format']}",
                "url": r["secure_url"],
                "uploaded_at": r.get("created_at", ""),
            }
            for r in resources
        ]
        return {"count": len(files), "files": files}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})


@app.get("/history")
async def upload_history():
    """MongoDB se upload history return karo"""
    try:
        records = list(
            uploads_collection.find({}, {"_id": 0})
            .sort("uploaded_at", -1)
            .limit(100)
        )
        # datetime ko string me convert karo
        for r in records:
            if isinstance(r.get("uploaded_at"), datetime):
                r["uploaded_at"] = r["uploaded_at"].isoformat()
        return {"count": len(records), "history": records}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port)

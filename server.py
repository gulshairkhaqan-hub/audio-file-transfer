import os
from fastapi import FastAPI, UploadFile, File
from fastapi.responses import JSONResponse
from typing import List
import cloudinary
import cloudinary.uploader
import cloudinary.api

app = FastAPI(title="Audio Transfer Server")

# Cloudinary credentials are read from environment variables (kept secret, not in code)
cloudinary.config(
    cloud_name=os.getenv("CLOUDINARY_CLOUD_NAME"),
    api_key=os.getenv("CLOUDINARY_API_KEY"),
    api_secret=os.getenv("CLOUDINARY_API_SECRET"),
    secure=True,
)

# All audio files are stored inside this Cloudinary folder
UPLOAD_FOLDER = "audio_uploads"


@app.get("/")
def home():
    return {"status": "Server is running "}


@app.post("/receive")
async def receive_files(files: List[UploadFile] = File(...)):
    """Upload one or more audio files to Cloudinary (permanent storage)."""
    saved = []
    for file in files:
        result = cloudinary.uploader.upload(
            file.file,
            resource_type="video",      # audio is handled under 'video' in Cloudinary
            folder=UPLOAD_FOLDER,
            use_filename=True,
            unique_filename=False,
            overwrite=True,
        )
        name = f"{result['original_filename']}.{result['format']}"
        saved.append({"name": name, "url": result["secure_url"]})

    return {
        "message": f"{len(saved)} file(s) uploaded to Cloudinary successfully ",
        "files": saved,
    }


@app.get("/files")
async def list_files():
    """List all audio files currently stored in Cloudinary."""
    try:
        res = cloudinary.api.resources(
            resource_type="video",
            type="upload",
            prefix=f"{UPLOAD_FOLDER}/",
            max_results=100,
        )
        files = [
            {
                "name": f"{r['public_id'].split('/')[-1]}.{r['format']}",
                "url": r["secure_url"],
            }
            for r in res.get("resources", [])
        ]
        return {"count": len(files), "files": files}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port)

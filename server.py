import os
from fastapi import FastAPI, UploadFile, File
from fastapi.responses import JSONResponse
from typing import List
import cloudinary
import cloudinary.uploader
import cloudinary.api

app = FastAPI(title="Audio Transfer Server")

cloudinary.config(
    cloud_name=os.getenv("CLOUDINARY_CLOUD_NAME"),
    api_key=os.getenv("CLOUDINARY_API_KEY"),
    api_secret=os.getenv("CLOUDINARY_API_SECRET"),
    secure=True,
)

UPLOAD_FOLDER = "audio_uploads"


@app.get("/")
def home():
    return {"status": "Server is running "}


@app.post("/receive")
async def receive_files(files: List[UploadFile] = File(...)):
    saved = []
    for file in files:
        base_name = os.path.splitext(os.path.basename(file.filename))[0]
        result = cloudinary.uploader.upload(
            file.file,
            resource_type="video",
            folder=UPLOAD_FOLDER,
            public_id=base_name,
            overwrite=True,
        )
        name = f"{base_name}.{result['format']}"
        saved.append({"name": name, "url": result["secure_url"]})

    return {
        "message": f"{len(saved)} file(s) uploaded to Cloudinary successfully ",
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


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port)

from fastapi import FastAPI, UploadFile, File
from fastapi.responses import FileResponse, JSONResponse
from typing import List
import shutil
import os

app = FastAPI(title="Audio Transfer Server")

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)


@app.get("/")
def home():
    return {"status": "Server is running "}


@app.post("/receive")
async def receive_files(files: List[UploadFile] = File(...)):
    saved = []
    for file in files:
        save_path = os.path.join(UPLOAD_DIR, os.path.basename(file.filename))
        with open(save_path, "wb") as f:
            shutil.copyfileobj(file.file, f)
        saved.append(file.filename)

    return {
        "message": f"{len(saved)} file(s) received and saved successfully ",
        "files": saved,
    }


@app.get("/files")
async def list_files():
    files = sorted(os.listdir(UPLOAD_DIR)) if os.path.exists(UPLOAD_DIR) else []
    return {"count": len(files), "files": files}


@app.get("/send/{filename}")
async def send_file(filename: str):
    safe_name = os.path.basename(filename)
    file_path = os.path.join(UPLOAD_DIR, safe_name)

    if os.path.exists(file_path):
        return FileResponse(
            file_path,
            media_type="audio/wav",
            filename=safe_name,
            content_disposition_type="inline",
        )
    return JSONResponse(
        status_code=404,
        content={"error": f"File '{safe_name}' not found on server."},
    )


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port)

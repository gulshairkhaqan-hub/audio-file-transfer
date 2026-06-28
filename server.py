

from fastapi import FastAPI, UploadFile, File
from fastapi.responses import FileResponse, JSONResponse
import shutil
import os
import mimetypes

app = FastAPI(title="Audio Transfer Server")

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)  

last_uploaded_file = None


@app.get("/")
def home():
    
    return {"status": "Server is running "}


@app.post("/receive")
async def receive_file(file: UploadFile = File(...)):
   
    global last_uploaded_file

    save_path = os.path.join(UPLOAD_DIR, os.path.basename(file.filename))

   
    with open(save_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

   
    last_uploaded_file = save_path

    return {"message": f"File '{file.filename}' received and saved successfully "}


@app.get("/send")
async def send_file():
   
    if last_uploaded_file and os.path.exists(last_uploaded_file):
        filename = os.path.basename(last_uploaded_file)



        media_type = "audio/wav"
        
        return FileResponse( 
            last_uploaded_file,
            media_type=media_type,
            filename=filename,
            content_disposition_type="inline",
        )
    return JSONResponse(
        status_code=404,
        content={"error": "No file available on server. Pehle Section 1 se file upload karein."},
    )


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port)

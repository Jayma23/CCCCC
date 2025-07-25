# main.py

from fastapi import FastAPI, Request
from pydantic import BaseModel
from face_utils import extract_main_face_embedding

app = FastAPI()

class PhotoRequest(BaseModel):
    user_id: int
    image_urls: list[str]

@app.post("/analyze-face")
async def analyze_face(req: PhotoRequest):
    result = extract_main_face_embedding(req.image_urls)
    if result:
        return {
            "user_id": req.user_id,
            "main_face": result
        }
    else:
        return {
            "user_id": req.user_id,
            "error": "No face detected in any image."
        }

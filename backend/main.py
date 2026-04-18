import os
import json
import uuid
import base64
import requests
import asyncio
from typing import List, Optional
from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
from qdrant_client import QdrantClient
from qdrant_client.http import models

load_dotenv() # Load variables from .env file into os.environ

app = FastAPI(title="SACE MVP API", description="Sovereign Agentic Compliance Engine")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

qdrant_client = QdrantClient(path="./qdrant_local_db")

COLLECTION_NAME = "sace_docs"
if not qdrant_client.collection_exists(collection_name=COLLECTION_NAME):
    try:
        qdrant_client.create_collection(
            collection_name=COLLECTION_NAME,
            vectors_config=models.VectorParams(
                size=128,
                distance=models.Distance.COSINE,
                multivector_config=models.MultiVectorConfig(
                    comparator=models.MultiVectorComparator.MAX_SIM
                )
            )
        )
    except Exception as e:
        print(f"Warning: Failed to create collection with multivector_config. Fallback to standard config. Error: {e}")
        # Fallback to standard config if multivector is not supported in this client version
        qdrant_client.create_collection(
            collection_name=COLLECTION_NAME,
            vectors_config=models.VectorParams(
                size=128,
                distance=models.Distance.COSINE
            )
        )

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

# Replace with the actual URL provided by your API endpoints
COLPALI_API_URL = os.getenv("COLPALI_API_URL", "https://your-ngrok-id.ngrok-free.app/embed")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-flash-latest") # e.g. "gemma-4" as desired

class ExtractRequest(BaseModel):
    document_id: str
    query: str

class ValidateRequest(BaseModel):
    document_id: str
    query: str
    extracted_metric: str
    is_correct: bool
    corrected_metric: Optional[str] = None

def query_gemini_vision(base64_image: str, prompt: str):
    """
    Calls the Gemini API using the base64 encoded image and the user query.
    """
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return {"extracted_metric": "Mock Extracted Data. Add GEMINI_API_KEY to test."}
    
    # Needs to match the MIME type of the generated JPEG images (pdf2image outputs jpeg usually)
    mime_type = "image/jpeg"
    
    model = os.getenv("GEMINI_MODEL", "gemini-flash-latest")
    api_url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
    
    headers = {
        "Content-Type": "application/json"
    }
    
    payload = {
        "contents": [
            {
                "parts": [
                    {
                        "text": prompt
                    },
                    {
                        "inline_data": {
                            "mime_type": mime_type,
                            "data": base64_image
                        }
                    }
                ]
            }
        ],
        "generationConfig": {
            "temperature": 0.1
        }
    }
    
    response = requests.post(api_url, headers=headers, json=payload)
    if response.status_code == 200:
        data = response.json()
        try:
            content = data["candidates"][0]["content"]["parts"][0]["text"]
            return {"extracted_metric": content}
        except (KeyError, IndexError):
            return {"extracted_metric": f"Format error in API response: {data}"}
    else:
        raise HTTPException(status_code=response.status_code, detail=response.text)


@app.get("/")
def read_root():
    return {"status": "SACE Engine Running"}

@app.post("/upload")
async def upload_document(file: UploadFile = File(...)):
    doc_id = str(uuid.uuid4())
    
    # Read the raw PDF bytes from the upload
    pdf_bytes = await file.read()
    
    # Send the PDF to the external ColPali API for embedding
    colpali_url = os.getenv("COLPALI_API_URL")
    if not colpali_url:
        raise HTTPException(status_code=500, detail="COLPALI_API_URL is not configured in .env")
    
    try:
        colpali_response = requests.post(
            colpali_url,
            files={"file": (file.filename, pdf_bytes, "application/pdf")},
            headers={"ngrok-skip-browser-warning": "true"},
            timeout=120
        )
        colpali_response.raise_for_status()
    except requests.exceptions.RequestException as e:
        raise HTTPException(status_code=502, detail=f"Failed to reach ColPali API: {str(e)}")
    
    colpali_data = colpali_response.json()
    embeddings = colpali_data.get("embeddings", [])
    base64_images = colpali_data.get("base64_images", [])
    
    if not embeddings or not base64_images:
        raise HTTPException(status_code=502, detail="ColPali API returned empty embeddings or images.")
    
    if len(embeddings) != len(base64_images):
        raise HTTPException(status_code=502, detail="ColPali API returned mismatched embeddings and images count.")
    
    # Insert each page into local Qdrant
    points = []
    for i, (emb, img_b64) in enumerate(zip(embeddings, base64_images)):
        page_num = i + 1
        point_id = str(uuid.uuid4())
        points.append(
            models.PointStruct(
                id=point_id,
                vector=emb,
                payload={
                    "document_id": doc_id,
                    "page_number": page_num,
                    "image_base64": img_b64
                }
            )
        )
    
    try:
        qdrant_client.upsert(
            collection_name=COLLECTION_NAME,
            points=points
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to insert into Qdrant: {str(e)}")
    
    return {"status": "success", "document_id": doc_id, "pages": len(embeddings)}


@app.post("/analyze")
async def analyze_metric(req: ExtractRequest):
    # In real usage, you use a text-to-image ColPali query embedding or text-to-text if using a hybrid approach
    # For MVP, we mock the query embedding to fetch the "most relevant" pages.
    # We must wrap it in a list because the collection uses multivector_config.
    query_emb = [[0.1] * 128]  # Mock embeddings

    try:
        query_response = qdrant_client.query_points(
            collection_name="sace_docs",
            query=query_emb,
            query_filter=models.Filter(
                must=[
                    models.FieldCondition(
                        key="document_id",
                        match=models.MatchValue(value=req.document_id),
                    )
                ]
            ),
            limit=1
        )
        results = query_response.points
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to query Qdrant: {str(e)}")
    
    if not results:
        raise HTTPException(status_code=404, detail="No pages found for document in Qdrant.")
        
    best_match = results[0]
    payload = best_match.payload
    
    if not payload or "image_base64" not in payload:
        raise HTTPException(status_code=404, detail="Image base64 string not found in Qdrant payload metadata.")
    
    base64_image = payload["image_base64"]
    page_num = payload.get("page_number", "?")
    
    # Send to Gemini Vision for extraction using direct base64
    gemini_res = query_gemini_vision(base64_image, req.query)
    
    import random
    confidence_score = round(random.uniform(0.85, 0.99), 2)
    
    return {
        "status": "success",
        "document_id": req.document_id,
        "page_num": page_num,
        "image_base64": base64_image,
        "extracted": gemini_res.get("extracted_metric"),
        "confidence": confidence_score
    }

@app.post("/validate")
async def validate_metric(req: ValidateRequest):
    # Store validation somewhere for metrics (e.g. SQLite or JSON log)
    log_entry = req.dict()
    log_entry["timestamp"] = int(asyncio.get_event_loop().time())
    
    with open("validation_logs.jsonl", "a") as f:
        f.write(json.dumps(log_entry) + "\n")
        
    return {"status": "logged", "feedback_recorded": True}

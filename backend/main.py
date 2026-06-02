import os
import json
import base64
import sys
from typing import List
from dotenv import load_dotenv
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI
from pydantic import BaseModel, Field

sys.stdout.reconfigure(line_buffering=True)
load_dotenv()

app = FastAPI(title="AI Financial Data Converter API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class DataRow(BaseModel):
    column_a: str = Field(description="Item name, description, or row header.")
    column_b: str = Field(description="Second column data (Value/Amount). Empty if none.")
    column_c: str = Field(description="Third column data if present. Empty if none.")
    column_d: str = Field(description="Fourth column data if present. Empty if none.")

class ExtractedTable(BaseModel):
    table_title: str = Field(description="Title of the sheet or report")
    headers: List[str] = Field(description="List of detected column headers")
    rows: List[DataRow]

client = OpenAI(
    base_url=os.getenv("OPEN_SOURCE_BASE_URL", "http://localhost:11434/v1"),
    api_key=os.getenv("OPEN_SOURCE_API_KEY", "ollama")
)

@app.post("/api/convert")
async def convert_image(file: UploadFile = File(...)):
    print(f"\n🚀 [API ENGINE] Processing image file: {file.filename}", flush=True)

    try:
        image_bytes = await file.read()
        encoded_image = base64.b64encode(image_bytes).decode('utf-8')
        image_url = f"data:{file.content_type};base64,{encoded_image}"
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid image encoding sequence.")

    model_name = os.getenv("OPEN_SOURCE_MODEL", "qwen2.5vl:7b")

    # 1. Fetch Natural Reading Text for Copying/Viewing
    print("📝 [TXT ENGINE] Generating raw document transcription...", flush=True)
    try:
        text_response = client.chat.completions.create(
            model=model_name,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "Transcribe all the text found in this image naturally exactly as it reads. Just output the clean continuous text line-by-line as read from left to right without markdown tables."},
                        {"type": "image_url", "image_url": {"url": image_url}}
                    ]
                }
            ],
            temperature=0.1
        )
        extracted_text_string = text_response.choices[0].message.content
    except Exception as e:
        print(f"❌ Text branch failed: {str(e)}")
        extracted_text_string = "Failed to extract clean text stream."

    # 2. Fetch Tabular Schema Layout
    print("📊 [TABLE ENGINE] Parsing structure into JSON mapping...", flush=True)
    try:
        table_response = client.chat.completions.create(
            model=model_name,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text", 
                            "text": (
                                "Extract all details into rows. Map headers to the 'headers' array. "
                                "For every row under those headers, fill in column_a, column_b, column_c, and column_d. "
                                'Return format: {"table_title": "Extracted Data", "headers": ["Col1", "Col2"], "rows": [{"column_a": "val", "column_b": "val", "column_c": "val", "column_d": "val"}]}'
                            )
                        },
                        {"type": "image_url", "image_url": {"url": image_url}}
                    ]
                }
            ],
            response_format={"type": "json_object"},
            temperature=0.1
        )
        raw_json = table_response.choices[0].message.content
        table_data = json.loads(raw_json)
    except Exception as e:
        print(f"❌ Grid branch failed: {str(e)}")
        table_data = {"table_title": "Error Processing", "headers": ["Status"], "rows": [{"column_a": "Could not build structured grid grid structure"}]}

    # Return both pieces of data back together
    return {
        "raw_text": extracted_text_string,
        "structured_table": table_data
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
import os
import json
import base64
import sys
from typing import List, Dict, Any
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

class DynamicTable(BaseModel):
    table_title: str = Field(description="Title of the sheet or report")
    headers: List[str] = Field(description="List of detected column headers. Match the columns found in the image exactly.")
    rows: List[List[str]] = Field(description="Each row is an array of strings representing the data for each column. The length of this array must match the length of the headers array exactly.")

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

    # 1. Fetch Natural Reading Text
    print("📝 [TXT ENGINE] Generating raw document transcription...", flush=True)
    try:
        text_response = client.chat.completions.create(
            model=model_name,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "Transcribe all the text found in this image naturally exactly as it reads line-by-line from left to right without markdown tables."},
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

    # 2. Fetch Dynamic Tabular Schema Layout - STRATEGIC FIX APPLIED HERE
    print("📊 [TABLE ENGINE] Parsing fluid matrix column mapping...", flush=True)
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
                                "You are an expert financial data parser. Extract EVERY piece of information from this financial/balance statement into a clean structured grid matrix.\n\n"
                                "CRITICAL RULES FOR EXTRACTION:\n"
                                "1. Identify the structural columns. For vertical balance sheets, this is typically standard items and their numerical values (e.g., ['Line Item / Account Description', 'Amount']).\n"
                                "2. DO NOT mash different vertical sections (like Assets and Liabilities) side-by-side into a single row if they are stacked vertically in the image. Extract them line-by-line as they appear sequentially.\n"
                                "3. Include headers, section titles (like 'Asset' or 'Liabilities'), individual account rows, and totals rows. Do not drop or ignore any line item or balance amount.\n"
                                "4. Ensure that every item lines up exactly with its correct corresponding value in that row.\n\n"
                                'Expected JSON Structure format example:\n'
                                '{"table_title": "Balance Sheet Summary", "headers": ["Financial Element", "Value"], "rows": [["Asset", ""], ["Cash & cash equivalent", "$25,913"], ["Total asset", "$70,257"], ["Liabilities", ""], ["Accounts payable", "$55,888"]]}'
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
        table_data = {
            "table_title": "Error Processing", 
            "headers": ["Error Logs Summary"], 
            "rows": [["Could not build dynamic layout automatically."]]
        }

    return {
        "raw_text": extracted_text_string,
        "structured_table": table_data
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
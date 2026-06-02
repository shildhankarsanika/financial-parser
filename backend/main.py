import io
import os
import json
import base64
import sys
from typing import List
from dotenv import load_dotenv
import pandas as pd

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI
from pydantic import BaseModel, Field

from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors

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
    column_a: str = Field(description="Item name, account title, row header, or description.")
    column_b: str = Field(description="Secondary column data (Value/Amount/Cost). Empty if none.")
    column_c: str = Field(description="Tertiary column data if present. Empty if none.")
    column_d: str = Field(description="Quaternary column data if present. Empty if none.")

class ExtractedTable(BaseModel):
    table_title: str = Field(description="Name of company or title of sheet/invoice")
    headers: List[str] = Field(description="List of detected column headers")
    rows: List[DataRow]

client = OpenAI(
    base_url=os.getenv("OPEN_SOURCE_BASE_URL", "http://localhost:11434/v1"),
    api_key=os.getenv("OPEN_SOURCE_API_KEY", "ollama")
)

@app.post("/api/convert")
async def convert_image(
    file: UploadFile = File(...),
    output_format: str = Form(...) 
):
    print("\n🚀 [START] --- NEW CONVERSION REQUEST RECEIVED ---", flush=True)
    print(f"⚙️ [FORMAT] Target requested output format: {output_format.upper()}", flush=True)

    try:
        image_bytes = await file.read()
        encoded_image = base64.b64encode(image_bytes).decode('utf-8')
        image_url = f"data:{file.content_type};base64,{encoded_image}"
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid image file uploaded.")

    model_name = os.getenv("OPEN_SOURCE_MODEL", "qwen2.5vl:7b")

    # 🛑 SPECIAL PATH FOR PLAIN TEXT RAW EXTRACTION
    if output_format == "txt":
        print("📄 [TXT ENGINE] Querying LLM for clean raw paragraph extraction...", flush=True)
        try:
            response = client.chat.completions.create(
                model=model_name,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "text", 
                                "text": "Transcribe all the text found in this image naturally exactly as it reads. Do not arrange it into structured data table blocks, column keys, or markdown grids. Just output the clean continuous text line-by-line as read from left to right."
                            },
                            {
                                "type": "image_url", 
                                "image_url": {"url": image_url}
                            }
                        ]
                    }
                ],
                temperature=0.1
            )
            raw_text = response.choices[0].message.content
            print("🏁 [SUCCESS] Clean raw transcription captured successfully.", flush=True)
            
            return StreamingResponse(
                io.BytesIO(raw_text.encode('utf-8')),
                media_type="text/plain",
                headers={"Content-Disposition": "attachment; filename=extracted_data.txt"}
            )
        except Exception as e:
            print(f"❌ [CRITICAL ERROR] TXT translation failed: {str(e)}", flush=True)
            raise HTTPException(status_code=500, detail=f"Text extraction failure: {str(e)}")

    # 📦 TABULAR DATA PATH (JSON, CSV, XLSX, PDF)
    try:
        print("📊 [TABLE ENGINE] Querying LLM for strict schema mapping...", flush=True)
        response = client.chat.completions.create(
            model=model_name,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text", 
                            "text": (
                                "You are an expert data extraction AI. Look closely at the provided image and extract all text rows. "
                                "Map the headers found in the image to the 'headers' array. "
                                "For every data row under those headers, fill in column_a, column_b, column_c, and column_d sequentially. "
                                "Do not leave fields blank if text is present. Return data matching this exact schema shape: "
                                '{"table_title": "Extracted Data", "headers": ["Column_1", "Column_2", "Column_3", "Column_4"], "rows": [{"column_a": "text_here", "column_b": "text_here", "column_c": "text_here", "column_d": "text_here"}]}'
                            )
                        },
                        {
                            "type": "image_url", 
                            "image_url": {"url": image_url}
                        }
                    ]
                }
            ],
            response_format={"type": "json_object"},
            temperature=0.1
        )
        
        raw_json = response.choices[0].message.content
        parsed_data = ExtractedTable.model_validate(json.loads(raw_json))
        print(f"📊 [VALIDATION] Extracted Grid Rows: {len(parsed_data.rows)}", flush=True)
        
    except Exception as e:
        print(f"❌ [CRITICAL ERROR] Table generation crashed: {str(e)}", flush=True)
        raise HTTPException(status_code=500, detail=f"Extraction failure: {str(e)}")

    # Structure DataFrame
    raw_rows = []
    for r in parsed_data.rows:
        raw_rows.append([r.column_a, r.column_b, r.column_c, r.column_d])
    
    num_cols = len(raw_rows[0]) if raw_rows else 4
    headers = parsed_data.headers[:num_cols]
    while len(headers) < num_cols:
        headers.append(f"Column_{len(headers)+1}")

    df = pd.DataFrame(raw_rows, columns=headers)

    if output_format == "json":
        return parsed_data.model_dump()
        
    elif output_format == "csv":
        stream = io.StringIO()
        df.to_csv(stream, index=False)
        return StreamingResponse(
            io.BytesIO(stream.getvalue().encode('utf-8')), 
            media_type="text/csv", 
            headers={"Content-Disposition": "attachment; filename=extracted_data.csv"}
        )
        
    elif output_format == "xlsx":
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df.to_excel(writer, index=False, sheet_name="Extracted Data")
        output.seek(0)
        return StreamingResponse(
            output, 
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", 
            headers={"Content-Disposition": "attachment; filename=extracted_data.xlsx"}
        )

    elif output_format == "pdf":
        pdf_buffer = io.BytesIO()
        doc = SimpleDocTemplate(pdf_buffer, pagesize=letter, rightMargin=30, leftMargin=30, topMargin=30, bottomMargin=30)
        story = []
        
        styles = getSampleStyleSheet()
        title_style = ParagraphStyle('TitleStyle', parent=styles['Heading1'], fontSize=18, spaceAfter=12, textColor=colors.HexColor("#0070f3"))
        cell_style = ParagraphStyle('CellStyle', parent=styles['Normal'], fontSize=9, leading=11)
        header_style = ParagraphStyle('HeaderStyle', parent=styles['Normal'], fontSize=10, bold=True, textColor=colors.white)

        story.append(Paragraph(parsed_data.table_title or "Extracted Financial Report", title_style))
        story.append(Spacer(1, 10))
        
        table_data = [[Paragraph(f"<b>{h}</b>", header_style) for h in headers]]
        for row in raw_rows:
            table_data.append([Paragraph(str(cell), cell_style) for cell in row])
        
        pdf_table = Table(table_data, colWidths=[135, 135, 135, 135])
        pdf_table.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#0070f3")),
            ('ALIGN', (0,0), (-1,-1), 'LEFT'),
            ('VALIGN', (0,0), (-1,-1), 'TOP'),
            ('INNERGRID', (0,0), (-1,-1), 0.5, colors.lightgrey),
            ('BOX', (0,0), (-1,-1), 1, colors.HexColor("#0070f3")),
            ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor("#f9f9f9")]),
            ('TOPPADDING', (0,0), (-1,-1), 6),
            ('BOTTOMPADDING', (0,0), (-1,-1), 6),
        ]))
        
        story.append(pdf_table)
        doc.build(story)
        pdf_buffer.seek(0)
        
        return StreamingResponse(
            pdf_buffer,
            media_type="application/pdf",
            headers={"Content-Disposition": "attachment; filename=extracted_data.pdf"}
        )
    
    else:
        raise HTTPException(status_code=400, detail="Unsupported output format requested.")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
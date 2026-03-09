"""
Excel API router.

Endpoints:
  POST /api/upload        — Upload .xlsx / .xls, get parsed table
  POST /api/chart-data    — Send (possibly edited) table, get chart payload
"""
import io
from typing import Any, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from app.config import Settings, get_settings
from app.services.chart import build_chart_data
from app.services.parser import parse_excel

router = APIRouter(prefix="/api", tags=["excel"])

ALLOWED_TYPES = {
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
}
ALLOWED_EXTENSIONS = {".xlsx", ".xls"}


# ── Request / Response Models ──────────────────────────────────────────────

class TablePayload(BaseModel):
    headers: list[str]
    rows: list[list[Any]]


class UploadResponse(BaseModel):
    headers: list[str]
    rows: list[list[Any]]
    confidence: float
    stage: int
    warnings: list[str]
    sheet_names: list[str]
    active_sheet: str


class ChartResponse(BaseModel):
    labelKey: Optional[str]
    data: list[dict[str, Any]]
    numericKeys: list[str]
    suggestedType: str


# ── Helpers ───────────────────────────────────────────────────────────────

def _validate_extension(filename: str) -> None:
    ext = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{ext}'. Please upload an .xlsx or .xls file.",
        )


# ── Endpoints ─────────────────────────────────────────────────────────────

@router.post("/upload", response_model=UploadResponse)
async def upload_excel(
    file: UploadFile = File(...),
    sheet: Optional[str] = Form(None),
    settings: Settings = Depends(get_settings),
):
    """
    Accept an Excel file, parse the selected worksheet (or first by default), and return:
    - headers (list of column names)
    - rows    (list of data rows)
    - confidence score from the parser
    - stage used (1 = heuristic, 2 = LLM)
    - any warnings
    - sheet_names (all sheet tabs in the workbook)
    - active_sheet (the sheet that was parsed)
    """
    _validate_extension(file.filename or "")

    content = await file.read()
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    max_bytes = settings.MAX_UPLOAD_MB * 1024 * 1024
    if len(content) > max_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"File too large ({len(content) / 1024 / 1024:.1f} MB). Maximum allowed size is {settings.MAX_UPLOAD_MB} MB.",
        )

    try:
        result = await parse_excel(content, settings, sheet_name=sheet)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Failed to parse Excel file: {exc}")

    if not result.headers:
        raise HTTPException(
            status_code=422,
            detail="Could not detect any tabular data in the selected worksheet.",
        )

    return UploadResponse(
        headers=result.headers,
        rows=result.rows,
        confidence=round(result.confidence, 3),
        stage=result.stage,
        warnings=result.warnings,
        sheet_names=result.sheet_names,
        active_sheet=result.active_sheet,
    )


@router.post("/chart-data", response_model=ChartResponse)
async def get_chart_data(payload: TablePayload):
    """
    Accept the current (possibly user-edited) table and return
    Recharts-compatible chart data with a suggested chart type.
    """
    chart = build_chart_data(payload.headers, payload.rows)
    return ChartResponse(**chart)

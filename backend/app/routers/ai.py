"""
AI router — local LLM powered endpoints.

Endpoints:
  POST /api/ai/analyze   — Module 1 & 2: judge chart-ability + suggest axes
  POST /api/ai/report    — Module 3: stream analysis report / chat (SSE)
  GET  /api/ai/status    — health-check for local LLM connection
"""

from __future__ import annotations

import asyncio
import json
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.config import Settings, get_settings
from app.services.ai import analyze_table, stream_report, generate_chart_html

router = APIRouter(prefix="/api/ai", tags=["ai"])


# ── Request / Response Models ──────────────────────────────────────────────

class AnalyzeRequest(BaseModel):
    headers: list[str]
    rows: list[list[Any]]


class AnalyzeResponse(BaseModel):
    can_graph: bool
    reason: str
    x_key: Optional[str]
    y_keys: list[str]
    chart_type: str


class ChatMessage(BaseModel):
    role: str   # "user" | "assistant"
    content: str


class ChartHtmlRequest(BaseModel):
    headers: list[str]
    rows: list[list[Any]]
    x_key: Optional[str] = None
    y_keys: list[str] = []
    chart_type: str = "bar"
    custom_options: Optional[dict] = None


class ReportRequest(BaseModel):
    headers: list[str]
    rows: list[list[Any]]
    x_key: Optional[str] = None
    y_keys: list[str] = []
    chart_type: str = "bar"
    question: str
    history: list[ChatMessage] = []
    current_html: Optional[str] = None  # Current chart HTML for AI to modify directly
    inject_data: bool = True  # False → skip table context (style-only requests)


# ── Endpoints ─────────────────────────────────────────────────────────────

@router.get("/status")
async def ai_status(settings: Settings = Depends(get_settings)) -> dict:
    """Quick check — is the local LLM reachable?"""
    if not settings.LOCAL_LLM_ENABLED:
        return {"enabled": False, "url": settings.LOCAL_LLM_URL}

    import httpx
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(f"{settings.LOCAL_LLM_URL}/v1/models")
            models = resp.json() if resp.status_code == 200 else {}
    except Exception as exc:
        return {"enabled": True, "reachable": False, "error": str(exc), "url": settings.LOCAL_LLM_URL}

    return {
        "enabled": True,
        "reachable": True,
        "url": settings.LOCAL_LLM_URL,
        "model": settings.LOCAL_LLM_MODEL,
        "models": models,
    }


@router.post("/chart-html")
def chart_html(
    body: ChartHtmlRequest,
    settings: Settings = Depends(get_settings),
) -> dict:
    """
    Module 4: Generate a self-contained Chart.js HTML string.
    No LLM call — pure template generation from the selected axes.
    Returns { html: "<!DOCTYPE html>..." }
    """
    if not body.y_keys:
        raise HTTPException(status_code=400, detail="Y축 항목을 선택해주세요.")

    html = generate_chart_html(
        headers=body.headers,
        rows=body.rows,
        x_key=body.x_key,
        y_keys=body.y_keys,
        chart_type=body.chart_type,
        custom_options=body.custom_options,
        max_points=settings.CHART_HTML_MAX_POINTS,
    )
    return {"html": html}


@router.post("/analyze", response_model=AnalyzeResponse)
async def analyze(
    body: AnalyzeRequest,
    settings: Settings = Depends(get_settings),
) -> AnalyzeResponse:
    """
    Module 1 & 2:
    - Read headers + rows (sampled internally)
    - Ask local LLM if data can be graphed
    - Return suggested X/Y axes + chart type
    """
    if not settings.LOCAL_LLM_ENABLED:
        raise HTTPException(status_code=503, detail="Local LLM is disabled.")

    if not body.headers:
        raise HTTPException(status_code=400, detail="No headers provided.")

    try:
        result = await analyze_table(body.headers, body.rows, settings)
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"LLM 연결 실패: {exc}. LM Studio가 {settings.LOCAL_LLM_URL} 에서 실행 중인지 확인하세요.",
        )

    return AnalyzeResponse(**result)


@router.post("/report")
async def report(
    body: ReportRequest,
    settings: Settings = Depends(get_settings),
) -> StreamingResponse:
    """
    Module 3:
    - Accept data context + conversation history + user question
    - Stream the LLM's response as text/event-stream (SSE)

    SSE format:
      data: <text chunk>\\n\\n
      data: [DONE]\\n\\n
    """
    if not settings.LOCAL_LLM_ENABLED:
        raise HTTPException(status_code=503, detail="Local LLM is disabled.")

    history = [{"role": m.role, "content": m.content} for m in body.history]

    async def event_generator():
        try:
            async for chunk in stream_report(
                headers=body.headers,
                rows=body.rows,
                x_key=body.x_key,
                y_keys=body.y_keys,
                chart_type=body.chart_type,
                question=body.question,
                history=history,
                settings=settings,
                current_html=body.current_html,
                inject_data=body.inject_data,
            ):
                # Escape newlines inside SSE data field
                payload = json.dumps({"text": chunk}, ensure_ascii=False)
                yield f"data: {payload}\n\n"

        except Exception as exc:
            err = json.dumps({"error": str(exc)}, ensure_ascii=False)
            yield f"data: {err}\n\n"

        yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )

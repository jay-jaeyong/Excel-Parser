"""
FastAPI application entry point.
"""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers.excel import router as excel_router
from app.routers.ai import router as ai_router


settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: log active LLM config
    if settings.llm_enabled:
        print(f"[INFO] LLM fallback enabled — provider: {settings.LLM_PROVIDER}, model: "
              f"{settings.OPENAI_MODEL if settings.LLM_PROVIDER == 'openai' else settings.GEMINI_MODEL}")
    else:
        print("[INFO] LLM fallback disabled — using structural parser only.")
    yield


app = FastAPI(
    title="Excel Parser API",
    description="Upload Excel files, parse tabular data, and generate chart payloads.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(excel_router)
app.include_router(ai_router)


@app.get("/health", tags=["health"])
async def health() -> dict:
    return {
        "status": "ok",
        "llm_enabled": settings.llm_enabled,
        "llm_provider": settings.LLM_PROVIDER,
    }

"""
Configuration loader — reads from .env file at startup.
"""
from functools import lru_cache
from typing import Literal, Optional
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ── LLM provider selection ─────────────────────────────────────
    LLM_PROVIDER: Optional[Literal["openai", "gemini"]] = None

    # ── OpenAI ────────────────────────────────────────────────────-
    OPENAI_API_KEY: Optional[str] = None
    OPENAI_MODEL: str = "gpt-4o-mini"

    # ── Google Gemini ──────────────────────────────────────────────
    GEMINI_API_KEY: Optional[str] = None
    GEMINI_MODEL: str = "gemini-1.5-flash"

    # ── Local LLM (LM Studio / Ollama — OpenAI-compatible) ────────
    LOCAL_LLM_URL: str = "http://host.docker.internal:1234"
    # LM Studio API에서 표시되는 모델 ID (GET /v1/models 로 확인 가능)
    LOCAL_LLM_MODEL: str = "qwen/qwen3.5-9b"  # LM Studio → Developer 탭에서 확인
    LOCAL_LLM_ENABLED: bool = True
    # ── 16384 context 기준 튜닝 ────────────────────────────────────
    # system(~300) + data(~2500) + history(~1000) + response(4096) ≈ 7900  →  16384 이내
    LOCAL_LLM_MAX_SAMPLE_ROWS: int = 25     # 표 데이터 미리보기 행 수
    LOCAL_LLM_MAX_TOKENS: int = 4096        # 리포트/채팅 응답 최대 토큰
    LOCAL_LLM_MAX_PROMPT_CHARS: int = 10000 # 프롬프트 데이터 문자 제한 (~2500 토큰)

    # ── Large file handling ────────────────────────────────────────
    MAX_UPLOAD_MB: int = 50                 # 업로드 최대 파일 크기 (MB)
    MAX_ROWS_PARSE: int = 100_000           # 파서가 반환하는 최대 행 수 (초과 시 잘라냄)
    CHART_HTML_MAX_POINTS: int = 500        # HTML 차트 최대 데이터 포인트 수

    # ── Parser settings ────────────────────────────────────────────
    PARSER_CONFIDENCE_THRESHOLD: float = 0.6

    # ── CORS ───────────────────────────────────────────────────────
    CORS_ORIGINS: str = "http://localhost:3000"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",")]

    @property
    def llm_enabled(self) -> bool:
        if self.LLM_PROVIDER == "openai":
            return bool(self.OPENAI_API_KEY)
        if self.LLM_PROVIDER == "gemini":
            return bool(self.GEMINI_API_KEY)
        return False


@lru_cache
def get_settings() -> Settings:
    return Settings()

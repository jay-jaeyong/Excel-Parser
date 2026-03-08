# Excel Parser

Excel 파일을 업로드하면 자동으로 파싱하고, 인터랙티브 차트·통계·AI 분석까지 제공하는 풀스택 웹 앱입니다.

## Tech Stack

| Layer | 기술 |
|---|---|
| Backend | Python 3.13, FastAPI, openpyxl, pandas, httpx |
| Frontend | Next.js (App Router), TypeScript, Tailwind CSS, Recharts |
| AI | LM Studio (로컬 LLM, OpenAI-compatible API) |
| Container | Docker + Docker Compose |

## 주요 기능

- **2단계 파서** — Stage 1: 구조 분석 (병합 셀, 다중 헤더). Stage 2: LLM 폴백 (복잡한 레이아웃)
- **시트 선택** — 다중 시트 Excel에서 탭으로 시트 전환
- **인터랙티브 차트** — Bar / Line / Pie / Scatter 차트, X/Y 축 자유 선택, 멀티 Y축, 드래그 확대, 페이지네이션
- **통계 요약** — 선택한 컬럼에 대한 기초 통계 (min, max, mean, stdDev 등)
- **AI 자동 분석** — 로컬 LLM이 데이터를 읽고 최적 X/Y 축 + 차트 유형 자동 추천
- **AI 채팅 차트 제어** — 채팅으로 데이터 분석 질문, 차트 타입/축 변경, 색상·제목·배경 등 시각 커스텀
- **Chart.js HTML 출력** — 공유 가능한 자체완결 HTML 차트 자동 생성, AI가 HTML 코드를 직접 수정

---

## Quick Start (Docker)

```bash
cd excel-parser
# Excel Parser

Excel 파일을 업로드하면 자동으로 파싱하고, 인터랙티브 차트·통계·AI 분석을 제공하는 풀스택 웹 애플리케이션입니다.

핵심 아이디어: 로컬 LLM(LM Studio)을 통해 복잡한 엑셀 레이아웃을 보완(parsing fallback)하고, AI가 차트 축·타입을 추천하거나 HTML 차트를 직접 생성·수정합니다.

## Tech Stack

- Backend: Python 3.13, FastAPI, pandas, openpyxl
- Frontend: Next.js (App Router), TypeScript, Tailwind CSS, Recharts
- AI: LM Studio (로컬 LLM, OpenAI-compatible API)
- Container: Docker + Docker Compose

## 빠른 시작 (Docker)

프로젝트 루트에서:

```bash
docker compose up --build
```

- 프론트엔드: http://localhost:3000
- 백엔드:    http://localhost:8000
- LM Studio (로컬): http://localhost:1234 (별도 설치 필요, 아래 참조)

AI 기능을 사용하려면 LM Studio에서 모델을 실행해야 합니다 (로컬 LLM 사용).

## 로컬 개발 (Docker 없이)

Backend:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Frontend:

```bash
cd frontend
npm install
npm run dev
# 브라우저: http://localhost:3000
```

## LM Studio (로컬 LLM) 간단 가이드

1. https://lmstudio.ai 에서 OS에 맞는 LM Studio 설치
2. 원하는 모델 다운로드 (Qwen 계열 권장)
3. Developer 탭에서 모델 선택 → Start Server (기본 포트 1234)
4. `backend/app/config.py` 의 `LOCAL_LLM_URL` 및 `LOCAL_LLM_MODEL`을 LM Studio에 맞게 설정.

	기본값(이 레포지토리 기준):

```python
# backend/app/config.py
LOCAL_LLM_URL = "http://host.docker.internal:1234"
LOCAL_LLM_MODEL = "qwen/qwen3.5-9b"  # 기본 설정 — 실제 LM Studio의 모델 ID로 교체하세요
```

연결 확인:

```bash
curl http://localhost:8000/api/ai/status
```

응답 예시: `{ "enabled": true, "reachable": true, "model": "..." }`

## 주요 API (간단 예시)

- POST `/api/upload` — 엑셀 업로드, 파싱 결과 반환
	- curl 예시:

```bash
curl -F "file=@data.xlsx" http://localhost:8000/api/upload
```

- POST `/api/chart-data` — (편집된) 테이블을 보내면 Recharts 호환 데이터 반환

```bash
curl -X POST -H "Content-Type: application/json" \
	-d '{"headers": ["A","B"], "rows": [["x", 1], ["y",2]]}' \
	http://localhost:8000/api/chart-data
```

- GET `/api/ai/status` — LLM 연결 상태 확인

- POST `/api/ai/analyze` — LLM으로부터 축/차트 추천

- POST `/api/ai/report` — 스트리밍 텍스트(SSE)로 분석 리포트/채팅

- POST `/api/ai/chart-html` — 선택한 축으로 self-contained Chart.js HTML 생성 (LLM 호출 없음)

## 구조(요약)

- backend/app/routers/excel.py  — `/api/upload`, `/api/chart-data`
- backend/app/routers/ai.py     — `/api/ai/*` (analyze, report, chart-html, status)
- backend/app/services/parser.py — 2단계 파서 (heuristic → LLM fallback)
- frontend/                       — Next.js 앱, 주요 훅: `useExcelData`, `useAiAnalysis`, `useAiChat`

## Troubleshooting (핵심)

- LM Studio가 실행 중인지 확인: `http://localhost:1234/v1/models` 접근
- `LOCAL_LLM_MODEL`이 LM Studio에서 실제로 로드된 모델 ID와 일치하는지 확인
- Docker 환경에서 LM Studio에 접근할 때는 `host.docker.internal:1234` 사용
- 업로드 파일 크기 제한: `backend/app/config.py` 의 `MAX_UPLOAD_MB` 확인

---

원하시면 다음을 추가로 정리해드리겠습니다:

- 배포용 Docker Compose 포트/환경 변수 문서화
- CI / lint / test 실행 가이드
- 예시 엑셀 파일과 샘플 API 요청 컬렉션 (Postman/Insomnia)


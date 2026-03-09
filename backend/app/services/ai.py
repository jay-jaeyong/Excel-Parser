"""
Local-LLM AI service (LM Studio / Ollama — OpenAI-compatible endpoint).

Three main functions
───────────────────
analyze_table()   → Module 1 & 2: judge chart-ability + suggest X/Y axes
stream_report()   → Module 3: stream an analysis report / answer chat questions
"""

from __future__ import annotations

import json
import re
from typing import Any, AsyncGenerator, Optional

from openai import AsyncOpenAI

from app.config import Settings


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _client(settings: Settings) -> AsyncOpenAI:
    """Return an AsyncOpenAI client pointed at the local LM Studio endpoint."""
    return AsyncOpenAI(
        base_url=f"{settings.LOCAL_LLM_URL}/v1",
        api_key="lm-studio",  # LM Studio ignores the key value
        timeout=60.0,
    )


def _table_to_markdown(headers: list[str], rows: list[list[Any]], max_cell_len: int = 30) -> str:
    """Convert headers + rows to a compact Markdown table.
    Cell values are truncated to max_cell_len chars to avoid token explosion.
    """
    def fmt(v: Any) -> str:
        s = str(v) if v is not None else ""
        return s[:max_cell_len] + "…" if len(s) > max_cell_len else s

    header_line = "| " + " | ".join(fmt(h) for h in headers) + " |"
    sep_line = "| " + " | ".join("---" for _ in headers) + " |"
    data_lines = [
        "| " + " | ".join(fmt(v) for v in row) + " |"
        for row in rows
    ]
    return "\n".join([header_line, sep_line] + data_lines)


def _smart_sample(rows: list[list[Any]], max_rows: int) -> list[list[Any]]:
    """Return a representative sample of up to max_rows rows.

    Strategy:
    - ≤ max_rows rows   : return all
    - ≤ 5× max_rows    : head-third + equidistant mid + tail-third
    - very large files  : head-10% + equidistant 80% + tail-10%
    """
    n = len(rows)
    if n <= max_rows:
        return rows

    head_n = max(3, max_rows // 5)
    tail_n = max(3, max_rows // 5)
    mid_n  = max_rows - head_n - tail_n

    head = rows[:head_n]
    tail = rows[-tail_n:]
    mid_pool = rows[head_n : n - tail_n]
    if mid_pool and mid_n > 0:
        step = max(1, len(mid_pool) // mid_n)
        mid  = mid_pool[::step][:mid_n]
    else:
        mid = []
    return head + mid + tail


def _estimate_tokens(text: str) -> int:
    """Rough token count estimate: 1 token ≈ 4 characters."""
    return len(text) // 4


def _sample_rows(rows: list[list[Any]], max_rows: int) -> list[list[Any]]:
    """Kept for backward compat — delegates to smart sampler."""
    return _smart_sample(rows, max_rows)


def _truncate_prompt(text: str, max_chars: int) -> str:
    """Hard-truncate a prompt string to fit within max_chars, adding a notice."""
    if len(text) <= max_chars:
        return text
    cutoff = max_chars - 60
    return text[:cutoff] + f"\n\n...(truncated to {max_chars} chars to fit context window)"


def _strip_think(text: str) -> str:
    """Remove <think>…</think> blocks that Qwen3 sometimes emits."""
    return re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()


def _extract_json(text: str) -> dict:
    """Extract the first JSON object from a (possibly noisy) LLM response."""
    text = _strip_think(text)

    # 1) Direct parse (ideal path)
    try:
        return json.loads(text.strip())
    except json.JSONDecodeError:
        pass

    # 2) Targeted: find a block that contains "can_graph" key (our expected key)
    #    Works even when the model emits prose before/after the JSON.
    m = re.search(r'(\{[^{}]*"can_graph"[^{}]*\})', text, re.DOTALL)
    if m:
        try:
            return json.loads(m.group(1))
        except json.JSONDecodeError:
            pass

    # 3) Greedy span: first '{' → last '}'
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1 and end > start:
        try:
            return json.loads(text[start : end + 1])
        except json.JSONDecodeError:
            pass

    # 4) Scan every '{' outward
    for i, ch in enumerate(text):
        if ch != "{":
            continue
        for j in range(len(text), i, -1):
            try:
                obj = json.loads(text[i:j])
                if isinstance(obj, dict):
                    return obj
                break
            except json.JSONDecodeError:
                continue
    return {}


# ─────────────────────────────────────────────────────────────────────────────
# Module 1 & 2 — Analyze table + suggest axes
# ─────────────────────────────────────────────────────────────────────────────

ANALYZE_SYSTEM = """\
/no_think
You are a JSON-only API. Your entire response MUST be a single valid JSON object.
Do NOT output any prose, reasoning, explanations, or markdown — before or after the JSON.
Start your response with `{` and end with `}`.

Task: given a table from an Excel file, decide whether it can be visualized as a chart
and suggest the best axis configuration.

Required JSON fields (no comments in your actual output):
{
  "can_graph": true,
  "reason": "<brief reason in Korean, 1–2 sentences>",
  "x_key": "<column name or null>",
  "y_keys": ["<numeric column name>"],
  "chart_type": "bar"
}

Rules:
- can_graph: true only when at least one column is clearly numeric/quantitative.
- x_key: prefer a categorical or date column; null if can_graph is false.
- y_keys: only include columns whose values are numeric; empty array if can_graph is false.
- chart_type: one of \"bar\", \"line\", \"scatter\", \"pie\".
"""

# Provide a short example to SHOW the model the exact required JSON-only output format.
# The model should reply with JUST the JSON object (no surrounding text).
ANALYZE_EXAMPLE = {
    "example_table": "| Date | Value |\n| --- | --- |\n| 2020-01-01 | 10 |\n| 2020-01-02 | 20 |",
    "example_response": {
        "can_graph": True,
        "reason": "날짜에 따른 수치 변화가 있어 시계열 라인 차트가 적합합니다.",
        "x_key": "Date",
        "y_keys": ["Value"],
        "chart_type": "line"
    }
}

ANALYZE_USER_TMPL = """\
Table ({total_rows} rows total, showing {sample_rows} rows):

{table_md}

Columns: {columns}

Return ONLY the JSON object. No other text.
"""


async def analyze_table(
    headers: list[str],
    rows: list[list[Any]],
    settings: Settings,
) -> dict:
    """
    Module 1: Determine if the table can be graphed.
    Module 2: Suggest X/Y axis keys and chart type.

    Returns a dict matching the ANALYZE JSON schema above.
    """
    sample = _sample_rows(rows, settings.LOCAL_LLM_MAX_SAMPLE_ROWS)
    table_md = _table_to_markdown(headers, sample)

    user_msg = ANALYZE_USER_TMPL.format(
        total_rows=len(rows),
        sample_rows=len(sample),
        table_md=table_md,
        columns=", ".join(f'"{h}"' for h in headers),
    )
    user_msg = _truncate_prompt(user_msg, settings.LOCAL_LLM_MAX_PROMPT_CHARS)

    client = _client(settings)
    response = await client.chat.completions.create(
        model=settings.LOCAL_LLM_MODEL,
        messages=[
            {"role": "system", "content": ANALYZE_SYSTEM},
            {"role": "user", "content": user_msg},
            # Prefill: force the model to start its response with '{',
            # bypassing any thinking/preamble prose the model might emit.
            {"role": "assistant", "content": "{"},
        ],
        temperature=0.0,
        max_tokens=1024,
    )

    raw = response.choices[0].message.content or ""
    # The model continues from our prefilled '{', so prepend it back.
    raw = "{" + raw
    result = _extract_json(raw)

    # If LLM response couldn't be parsed, log raw content for debugging
    if not result or not any(k in result for k in ("can_graph", "x_key", "y_keys", "chart_type", "reason")):
        # Truncate raw for logs
        snippet = (raw[:1000] + "...") if len(raw) > 1000 else raw
        print("[AI DEBUG] Unparsable analyze response:", snippet)
        # Return a helpful reason to the client while keeping raw in server logs
        return {
            "can_graph": False,
            "reason": f"LLM 응답 파싱 실패 — 서버 로그에 원문이 기록되었습니다. 일부: {snippet[:400]}",
            "x_key": None,
            "y_keys": [],
            "chart_type": "bar",
        }

    # Normalize / safe-defaults
    return {
        "can_graph": bool(result.get("can_graph", False)),
        "reason": str(result.get("reason", "분석 결과를 가져올 수 없습니다.")),
        "x_key": result.get("x_key") or None,
        "y_keys": list(result.get("y_keys") or []),
        "chart_type": result.get("chart_type") or "bar",
    }


# ─────────────────────────────────────────────────────────────────────────────
# Module 3 — Stream analysis report / chat
# ─────────────────────────────────────────────────────────────────────────────

REPORT_SYSTEM = """\
/no_think
You are a professional data analyst who writes clear, insightful reports in Korean.
You have access to an Excel dataset and its current chart configuration.
Answer the user's question or write the requested analysis report in Korean Markdown.
Be concise, use bullet points and headers where appropriate.
Do NOT output raw table data — summarize insights instead.

## 차트 데이터/타입 변경 (CHART_CONFIG)
If the user asks to change which columns are shown or the chart type,
append EXACTLY ONE line at the very end:

CHART_CONFIG:{"x_key":"<column or null>","y_keys":["<col1>"],"chart_type":"<bar|line|pie|scatter>"}

Rules:
- Only when user explicitly asks to change data columns or chart type.
- x_key must be one of the available columns or null.
- y_keys must only contain columns listed as numeric columns.
- chart_type: bar, line, pie, scatter.

## HTML 차트 직접 수정 (CHART_HTML_OUTPUT)
If the user asks to change the chart's visual appearance (colors, background, title,
chart type, axis labels, legend, gridlines, font size, etc.) OR generate any custom
visualization, table, dashboard, or data-driven UI:
1. Look at the "현재 HTML 차트 코드" section provided in the context.
2. Modify ONLY what the user requested — keep everything else unchanged.
3. Output the COMPLETE, fully self-contained modified HTML wrapped EXACTLY as:

<CHART_HTML>
<!DOCTYPE html>
...complete modified html...
</CHART_HTML>

## ★ CRITICAL: 기존 HTML 수정 시 데이터 코드 완전 보존 규칙 ★
When modifying an existing HTML chart, you MUST preserve the data loading and
filtering code EXACTLY as it appears in the current HTML. This includes:
- `const headers = window.__HEADERS__ || [];`
- `const rows = window.__ROWS__ || [];`
- ANY `.slice(N, M)`, `.filter(...)`, `.indexOf(...)`, or other row selection logic
- ANY derived variables computed from headers/rows

Do NOT simplify, rewrite, or replace the data section.
Do NOT change rows.slice(N, M) to rows — the user explicitly chose that range.
Do NOT change the data range unless the user EXPLICITLY asks to show different rows.

Only the following may change: chart type config, colors, CSS, title, legend, axis labels.

## 핵심 규칙 — 데이터는 반드시 window globals에서 읽기
The host page ALWAYS injects the FULL Excel dataset before the HTML runs:
  window.__HEADERS__  — string[]          (column names)
  window.__ROWS__     — any[][]           (all data rows, full dataset)

In EVERY generated HTML file, read data from these globals:
```
const headers = window.__HEADERS__ || [];
const rows    = window.__ROWS__    || [];
```
NEVER hardcode data values (no hardcoded labels/numbers arrays).
NEVER fetch data from external URLs.
Always derive labels, datasets, table rows, etc. directly from headers/rows.

You can use any of: Chart.js 4 (CDN), plain Canvas, SVG, D3 (CDN), vanilla JS.
The file must be self-contained — all JS loaded from a public CDN is fine.

Other rules:
- Use the provided current HTML as the base and change only the requested parts.
- Place the <CHART_HTML>...</CHART_HTML> block at the VERY END of your response.
- If no current HTML is provided, generate a new chart from scratch using the globals.
- For changing which data columns are shown or chart type (without custom HTML), use CHART_CONFIG instead.
- CHART_CONFIG and CHART_HTML_OUTPUT can both appear in the same response.
- Do NOT include the <CHART_HTML> block for analysis-only questions.
"""


def _build_report_context(
    headers: list[str],
    rows: list[list[Any]],
    x_key: Optional[str],
    y_keys: list[str],
    chart_type: str,
    settings: Settings,
) -> str:
    """Build the data context string for the report prompt.
    Only includes the selected X and Y columns to reduce token usage.
    """
    sample_all = _smart_sample(rows, settings.LOCAL_LLM_MAX_SAMPLE_ROWS)

    # Filter to only the selected columns (x + y keys)
    selected_cols = [k for k in ([x_key] if x_key else []) + y_keys if k in headers]
    if selected_cols:
        col_indices = [headers.index(k) for k in selected_cols if k in headers]
        filtered_headers = [headers[i] for i in col_indices]
        filtered_rows = [[row[i] for i in col_indices] for row in sample_all]
    else:
        # Fallback: use all columns
        filtered_headers = headers
        filtered_rows = sample_all

    table_md = _table_to_markdown(filtered_headers, filtered_rows)

    # Auto-shrink if the table markdown alone exceeds half the prompt budget
    budget = settings.LOCAL_LLM_MAX_PROMPT_CHARS // 2
    shrink_iter = 0
    while _estimate_tokens(table_md) * 4 > budget and len(filtered_rows) > 5 and shrink_iter < 5:
        filtered_rows = _smart_sample(filtered_rows, max(5, len(filtered_rows) * 3 // 4))
        table_md = _table_to_markdown(filtered_headers, filtered_rows)
        shrink_iter += 1

    ctx = "## 데이터 정보\n"
    ctx += f"- 전체 행 수: {len(rows)}행 / {len(headers)}열 (선택된 컬럼: {len(filtered_headers)}개)\n"
    ctx += f"- X축: {x_key or '미설정'}\n"
    ctx += f"- Y축: {', '.join(y_keys) if y_keys else '미설정'}\n"
    ctx += f"- 차트 유형: {chart_type}\n"
    ctx += f"- 전체 콜럼: {', '.join(headers)}\n"
    # Identify numeric columns from the full dataset
    numeric_cols = []
    for ci, h in enumerate(headers):
        sample_vals = [r[ci] for r in rows[:20] if ci < len(r) and r[ci] is not None]
        nums = []
        for v in sample_vals:
            try:
                nums.append(float(v))
            except (TypeError, ValueError):
                pass
        if len(nums) >= len(sample_vals) * 0.6 and len(nums) > 0:
            numeric_cols.append(h)
    ctx += f"- 수치 콜럼 (차트 Y축으로 사용 가능): {', '.join(numeric_cols) if numeric_cols else '없음'}\n"
    ctx += (
        "\n## HTML 생성 시 데이터 접근 방법\n"
        "생성하는 HTML 코드에서 아래 전역 변수로 **전체 데이터**를 읽을 수 있습니다:\n"
        "  window.__HEADERS__  — 컬럼명 배열 (string[])\n"
        "  window.__ROWS__     — 전체 행 배열 (any[][])\n"
        "예시:\n"
        "  const headers = window.__HEADERS__;\n"
        "  const rows    = window.__ROWS__;\n"
        "  const xIdx = headers.indexOf('컬럼명');\n"
        "  const labels = rows.map(r => r[xIdx]);\n"
        "절대로 데이터를 HTML에 하드코딩하지 마세요.\n"
    )
    ctx += f"\n## 선택된 콜럼 데이터 샘플 ({len(filtered_rows)}행, 참고용)\n\n"
    ctx += table_md
    return ctx


# ─────────────────────────────────────────────────────────────────────────────
# Module 4 — Generate standalone Chart.js HTML
# ─────────────────────────────────────────────────────────────────────────────

_CHART_TYPE_MAP = {
    "bar": "bar",
    "line": "line",
    "pie": "pie",
    "scatter": "scatter",
}

_PALETTE = [
    "rgba(129,140,248,0.85)",  # indigo
    "rgba(52,211,153,0.85)",   # emerald
    "rgba(251,146,60,0.85)",   # orange
    "rgba(244,114,182,0.85)",  # pink
    "rgba(56,189,248,0.85)",   # sky
    "rgba(250,204,21,0.85)",   # yellow
    "rgba(167,139,250,0.85)",  # violet
    "rgba(74,222,128,0.85)",   # green
]


def generate_chart_html(
    headers: list[str],
    rows: list[list[Any]],
    x_key: Optional[str],
    y_keys: list[str],
    chart_type: str,
    custom_options: Optional[dict] = None,
    max_points: int = 500,
) -> str:
    """Generate a self-contained Chart.js HTML page for the given data.

    No LLM involved — pure template generation.
    custom_options keys: title, colors (list[str]), y_min, y_max, bg_color,
                         show_legend, x_label, y_label, grid_color.
    max_points: maximum data points in the chart (downsamples if exceeded).
    """
    import json as _json

    opts = custom_options or {}
    ctype = _CHART_TYPE_MAP.get(chart_type, "bar")

    # Downsample for large datasets so the browser doesn't freeze
    if len(rows) > max_points:
        original_count = len(rows)
        rows = _smart_sample(rows, max_points)
        # Notify via chart title suffix
        if "title" not in opts:
            opts = dict(opts)  # copy to avoid mutating caller's dict
            default_title = f"{y_keys[0] if y_keys else ''} 차트"
            opts["title"] = f"{default_title} (샘플 {len(rows)}/{original_count}인)"

    # Active color palette — custom overrides default
    active_palette = opts.get("colors") or _PALETTE

    # Build labels (X axis)
    if x_key and x_key in headers:
        x_idx = headers.index(x_key)
        labels = [str(row[x_idx]) if row[x_idx] is not None else "" for row in rows]
    else:
        labels = [str(i + 1) for i in range(len(rows))]

    # Build datasets (Y axes)
    datasets = []
    for di, key in enumerate(y_keys):
        if key not in headers:
            continue
        col_idx = headers.index(key)
        values = []
        for row in rows:
            v = row[col_idx]
            try:
                values.append(float(v) if v is not None else None)
            except (TypeError, ValueError):
                values.append(None)

        color = active_palette[di % len(active_palette)]
        # If color is a plain hex string, build a matching rgba for bg
        bg_color_ds = color
        border_color_ds = color
        if isinstance(color, str) and color.startswith("#"):
            bg_color_ds = color  # use as-is for hex
            border_color_ds = color
        elif isinstance(color, str):
            border_color_ds = color.replace("0.85", "1")

        ds: dict = {
            "label": key,
            "data": values,
            "backgroundColor": bg_color_ds,
            "borderColor": border_color_ds,
            "borderWidth": 2,
        }
        if ctype == "line":
            ds["fill"] = False
            ds["tension"] = 0.3
            ds["pointRadius"] = 3
        elif ctype == "pie":
            # Per-slice colors
            ds["backgroundColor"] = [active_palette[i % len(active_palette)] for i in range(len(labels))]
        datasets.append(ds)

    labels_json = _json.dumps(labels, ensure_ascii=False)
    datasets_json = _json.dumps(datasets, ensure_ascii=False)

    # Resolve options
    title_text = opts.get("title") or f"{y_keys[0] if y_keys else ''} 차트"
    show_legend = opts.get("show_legend", True)
    grid_color_x = opts.get("grid_color", "#1e293b")
    grid_color_y = opts.get("grid_color", "#334155")
    bg_body = opts.get("bg_color", "#0f1117")
    # Determine good tick color based on bg brightness (simple heuristic)
    tick_color = "#333333" if bg_body in ("#ffffff", "white", "#fff") else "#94a3b8"

    # Chart options
    options: dict = {
        "responsive": True,
        "maintainAspectRatio": True,
        "plugins": {
            "legend": {"display": show_legend, "position": "top", "labels": {"color": tick_color, "font": {"size": 13}}},
            "title": {"display": True, "text": title_text, "color": "#c7d2fe", "font": {"size": 16}},
        },
    }
    if ctype not in ("pie",):
        scales: dict = {
            "x": {"ticks": {"color": tick_color}, "grid": {"color": grid_color_x}},
            "y": {"ticks": {"color": tick_color}, "grid": {"color": grid_color_y}},
        }
        if opts.get("y_min") is not None:
            scales["y"]["min"] = opts["y_min"]
        if opts.get("y_max") is not None:
            scales["y"]["max"] = opts["y_max"]
        if opts.get("x_label"):
            scales["x"]["title"] = {"display": True, "text": opts["x_label"], "color": tick_color}
        if opts.get("y_label"):
            scales["y"]["title"] = {"display": True, "text": opts["y_label"], "color": tick_color}
        options["scales"] = scales
    options_json = _json.dumps(options, ensure_ascii=False)

    title = f"{x_key or 'Index'} vs {', '.join(y_keys)}"

    display_title = opts.get("title") or f"{x_key or 'Index'} vs {', '.join(y_keys)}"
    chart_bg = opts.get("bg_color", "#0f1117")
    wrap_bg = "#1e293b" if chart_bg == "#0f1117" else "rgba(0,0,0,0.06)"
    text_color = "#e2e8f0" if chart_bg not in ("#ffffff", "white", "#fff") else "#1e293b"

    return f"""<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{display_title}</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js"></script>
  <style>
    * {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{
      background: {chart_bg};
      color: {text_color};
      font-family: 'Segoe UI', system-ui, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 24px 16px;
      min-height: 100vh;
    }}
    h2 {{ font-size: 1rem; color: #818cf8; margin-bottom: 18px; font-weight: 600; }}
    .chart-wrap {{
      width: 100%;
      max-width: 880px;
      background: {wrap_bg};
      border: 1px solid #334155;
      border-radius: 14px;
      padding: 24px;
    }}
    canvas {{ width: 100% !important; }}
  </style>
</head>
<body>
  <h2>{display_title}</h2>
  <div class="chart-wrap">
    <canvas id="chart"></canvas>
  </div>
  <script>
    new Chart(document.getElementById('chart'), {{
      type: '{ctype}',
      data: {{
        labels: {labels_json},
        datasets: {datasets_json}
      }},
      options: {options_json}
    }});
  </script>
</body>
</html>
"""


async def stream_report(
    headers: list[str],
    rows: list[list[Any]],
    x_key: Optional[str],
    y_keys: list[str],
    chart_type: str,
    question: str,
    history: list[dict],  # [{"role": "user"|"assistant", "content": str}]
    settings: Settings,
    current_html: Optional[str] = None,  # Current Chart.js HTML for AI to modify directly
    inject_data: bool = True,  # False → skip table context (style-only requests)
) -> AsyncGenerator[str, None]:
    """
    Module 3: Stream an analysis report as SSE text chunks.
    Yields raw text delta strings (caller wraps them as SSE).
    When current_html is provided, the AI can see and directly modify the chart HTML.
    """
    if inject_data:
        data_ctx = _build_report_context(headers, rows, x_key, y_keys, chart_type, settings)
        data_ctx = _truncate_prompt(data_ctx, settings.LOCAL_LLM_MAX_PROMPT_CHARS)
    else:
        # Style-only request: include only column names (no row data) so AI still knows column names
        data_ctx = (
            f"## 데이터 정보 (스타일 변경 요청으로 샘플 데이터 생략)\n"
            f"- 콜럼: {', '.join(headers)}\n"
            f"- X축: {x_key or '미설정'}, Y축: {', '.join(y_keys) if y_keys else '미설정'}\n"
            f"- 차트 유형: {chart_type}\n"
        )

    # Append current HTML chart code so AI can modify it directly
    # Use a generous limit so the full data-processing JS section is visible.
    if current_html:
        max_html = 16000
        html_snippet = (
            current_html[:max_html] + "\n...(HTML truncated for context limit)"
        ) if len(current_html) > max_html else current_html
        data_ctx += f"\n\n## 현재 HTML 차트 코드 (이 코드를 기반으로 수정하세요)\n```html\n{html_snippet}\n```"

    # Build message history
    messages: list[dict] = [
        {"role": "system", "content": REPORT_SYSTEM},
        {
            "role": "user",
            "content": (
                f"다음 데이터를 참고하여 질문에 답해주세요.\n\n{data_ctx}\n\n"
                f"---\n\n이제 대화를 시작합니다."
            ),
        },
        {"role": "assistant", "content": "네, 데이터를 확인했습니다. 질문해 주세요."},
    ]

    # Append conversation history
    for msg in history:
        messages.append({"role": msg["role"], "content": msg["content"]})

    # Append current question
    messages.append({"role": "user", "content": question})

    client = _client(settings)
    stream = await client.chat.completions.create(
        model=settings.LOCAL_LLM_MODEL,
        messages=messages,
        temperature=0.4,
        max_tokens=settings.LOCAL_LLM_MAX_TOKENS,
        stream=True,
    )

    # Buffer to handle <think> blocks that may span multiple chunks
    think_buf = ""
    in_think = False

    async for chunk in stream:
        delta = chunk.choices[0].delta.content
        if not delta:
            continue

        # Real-time <think>...</think> block stripping
        combined = think_buf + delta
        think_buf = ""

        while combined:
            if in_think:
                end = combined.find("</think>")
                if end == -1:
                    think_buf = combined  # incomplete, wait for more
                    combined = ""
                else:
                    combined = combined[end + len("</think>"):]
                    in_think = False
            else:
                start = combined.find("<think>")
                if start == -1:
                    if combined:
                        yield combined
                    combined = ""
                else:
                    if start > 0:
                        yield combined[:start]
                    combined = combined[start + len("<think>"):]
                    in_think = True

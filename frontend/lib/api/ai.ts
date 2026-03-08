/**
 * AI analysis and streaming API calls.
 */
import type { AnalyzeResult, ChartHtmlRequest, ReportRequest } from "./types";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export async function analyzeTable(
    headers: string[],
    rows: (string | number | null)[][]
): Promise<AnalyzeResult> {
    const res = await fetch(`${BASE_URL}/api/ai/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ headers, rows }),
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail ?? "AI 분석 실패");
    }
    return res.json();
}

/**
 * Generate a self-contained Chart.js HTML string from selected axes.
 * No LLM call — pure template generation on the backend.
 */
export async function getChartHtml(req: ChartHtmlRequest): Promise<{ html: string }> {
    const res = await fetch(`${BASE_URL}/api/ai/chart-html`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail ?? "HTML 차트 생성 실패");
    }
    return res.json();
}

/**
 * Stream an analysis report / chat response from the local LLM via SSE.
 * Returns an AbortController — call .abort() to cancel mid-stream.
 */
export function streamReport(
    req: ReportRequest,
    onChunk: (text: string) => void,
    onDone: () => void,
    onError: (err: string) => void,
): AbortController {
    const ctrl = new AbortController();

    (async () => {
        try {
            const res = await fetch(`${BASE_URL}/api/ai/report`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(req),
                signal: ctrl.signal,
            });

            if (!res.ok || !res.body) {
                const err = await res.json().catch(() => ({ detail: res.statusText }));
                onError(err.detail ?? "스트리밍 실패");
                return;
            }

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });

                const lines = buffer.split("\n");
                buffer = lines.pop() ?? "";

                for (const line of lines) {
                    if (!line.startsWith("data: ")) continue;
                    const payload = line.slice(6).trim();
                    if (payload === "[DONE]") { onDone(); return; }
                    try {
                        const obj = JSON.parse(payload);
                        if (obj.error) { onError(obj.error); return; }
                        if (obj.text) onChunk(obj.text);
                    } catch { /* ignore malformed SSE frame */ }
                }
            }
            onDone();
        } catch (err: unknown) {
            if ((err as Error).name !== "AbortError") {
                onError((err as Error).message ?? "네트워크 오류");
            }
        }
    })();

    return ctrl;
}

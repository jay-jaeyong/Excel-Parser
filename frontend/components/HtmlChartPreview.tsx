"use client";

import { Sparkles, RefreshCw, CheckCircle2, XCircle, ExternalLink, Copy, Check } from "lucide-react";
import type { AnalyzeResult, ChartCustomOptions } from "@/lib/api";

type CellValue = string | number | null;

interface Props {
    isAnalyzing: boolean;
    analyzeError: string | null;
    analyzeResult: AnalyzeResult | null;
    isGeneratingHtml: boolean;
    dots: string;
    htmlChart: string | null;
    chartCustomOptions: ChartCustomOptions;
    showHtmlCode: boolean;
    setShowHtmlCode: (v: boolean | ((prev: boolean) => boolean)) => void;
    copiedHtml: boolean;
    onCopyHtml: () => void;
    onResetStyle: () => void;
    /** Full Excel data injected into the iframe as window.__HEADERS__ / window.__ROWS__ */
    headers?: string[];
    rows?: CellValue[][];
}

/**
 * Prepend a <script> block that sets window.__HEADERS__ and window.__ROWS__
 * so AI-generated HTML can read the full dataset without needing it hardcoded.
 */
function injectDataGlobals(html: string, headers: string[], rows: CellValue[][]): string {
    const script = `<script>
window.__HEADERS__ = ${JSON.stringify(headers)};
window.__ROWS__ = ${JSON.stringify(rows)};
</script>`;
    // Insert right after <head> or <html> or at the very top
    if (html.includes("<head>")) return html.replace("<head>", `<head>\n${script}`);
    if (html.includes("<html")) return html.replace(/<html[^>]*>/, (m) => `${m}\n${script}`);
    return script + "\n" + html;
}

/**
 * Left panel (62%) of the AI Analysis Panel.
 * Shows the AI-generated HTML chart preview or loading / error state.
 */
export default function HtmlChartPreview({
    isAnalyzing,
    analyzeError,
    analyzeResult,
    isGeneratingHtml,
    dots,
    htmlChart,
    chartCustomOptions,
    showHtmlCode,
    setShowHtmlCode,
    copiedHtml,
    onCopyHtml,
    onResetStyle,
    headers = [],
    rows = [],
}: Props) {
    const srcDoc = htmlChart
        ? injectDataGlobals(htmlChart, headers, rows)
        : undefined;
    return (
        <div className="lg:w-[62%] flex flex-col gap-3 p-5 border-b lg:border-b-0 lg:border-r border-slate-700/60 bg-slate-900/30">

            {/* 분석 전 안내 */}
            {!analyzeResult && !analyzeError && !isAnalyzing && !isGeneratingHtml && (
                <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-4 py-8">
                    <div className="p-4 rounded-2xl bg-indigo-950/40 ring-1 ring-indigo-800/30">
                        <Sparkles className="w-8 h-8 text-indigo-400" />
                    </div>
                    <p className="text-sm font-medium text-slate-300">AI 자동 분석으로 시작하세요</p>
                    <p className="text-xs text-slate-600 leading-relaxed">
                        버튼을 누르면 LLM이 데이터를 읽고<br />최적 차트를 추천 · 자동 설정합니다
                    </p>
                </div>
            )}

            {/* 로딩 */}
            {(isAnalyzing || isGeneratingHtml) && (
                <div className="flex-1 flex items-center justify-center">
                    <div className="flex flex-col items-center gap-3">
                        <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin" />
                        <span className="text-sm text-indigo-300">
                            {isAnalyzing ? "데이터 분석 중" : "차트 생성 중"}{dots}
                        </span>
                    </div>
                </div>
            )}

            {/* 에러 */}
            {analyzeError && (
                <div className="flex items-start gap-2 text-sm text-red-400 bg-red-950/30 border border-red-800/40 rounded-xl px-4 py-3">
                    <XCircle className="w-4 h-4 mt-0.5 shrink-0" />
                    <div>
                        <p className="font-medium">분석 실패</p>
                        <p className="text-xs text-red-400/80 mt-0.5">{analyzeError}</p>
                    </div>
                </div>
            )}

            {/* 분석 결과 배지 */}
            {analyzeResult && !isAnalyzing && (
                <div
                    className={`flex items-start gap-2 px-3 py-2.5 rounded-xl border text-xs ${
                        analyzeResult.can_graph
                            ? "bg-emerald-950/30 border-emerald-800/40"
                            : "bg-red-950/30 border-red-800/40"
                    }`}
                >
                    {analyzeResult.can_graph
                        ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                        : <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                    }
                    <div>
                        <p className={`font-semibold ${analyzeResult.can_graph ? "text-emerald-300" : "text-red-300"}`}>
                            {analyzeResult.can_graph ? "차트 생성 가능" : "차트 생성 어려움"}
                        </p>
                        <p className="text-slate-400 mt-0.5 leading-relaxed">{analyzeResult.reason}</p>
                    </div>
                </div>
            )}

            {/* HTML 차트 미리보기 */}
            {htmlChart && !isGeneratingHtml && (
                <div className="flex flex-col gap-2 flex-1">
                    <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-500 flex items-center gap-1">
                            <ExternalLink className="w-3 h-3" /> HTML 차트 미리보기
                            {Object.keys(chartCustomOptions).length > 0 && (
                                <span className="ml-1 px-1.5 py-0.5 rounded text-indigo-400 bg-indigo-950/50 border border-indigo-800/40 text-[10px]">
                                    커스텀 적용 중
                                </span>
                            )}
                        </span>
                        <div className="flex gap-1.5">
                            {Object.keys(chartCustomOptions).length > 0 && (
                                <button
                                    onClick={onResetStyle}
                                    className="text-xs px-2 py-1 rounded-lg border border-slate-700 bg-slate-800 text-slate-400 hover:text-orange-300 hover:border-orange-600/40 transition-colors"
                                >
                                    스타일 초기화
                                </button>
                            )}
                            <button
                                onClick={() => setShowHtmlCode(v => !v)}
                                className="text-xs px-2 py-1 rounded-lg border border-slate-700 bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
                            >
                                {showHtmlCode ? "미리보기" : "코드"}
                            </button>
                            <button
                                onClick={onCopyHtml}
                                className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg border border-slate-700 bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
                            >
                                {copiedHtml
                                    ? <Check className="w-3 h-3 text-emerald-400" />
                                    : <Copy className="w-3 h-3" />
                                }
                                {copiedHtml ? "복사됨" : "복사"}
                            </button>
                        </div>
                    </div>

                    {showHtmlCode ? (
                        <pre className="text-xs text-slate-300 bg-slate-950 border border-slate-700 rounded-xl p-3 overflow-x-auto flex-1 font-mono whitespace-pre-wrap break-all">
                            {htmlChart}
                        </pre>
                    ) : (
                        <iframe
                            srcDoc={srcDoc}
                            sandbox="allow-scripts"
                            className="w-full rounded-xl border border-slate-700 flex-1"
                            style={{ height: 520 }}
                            title="Chart.js HTML Preview"
                        />
                    )}
                </div>
            )}
        </div>
    );
}

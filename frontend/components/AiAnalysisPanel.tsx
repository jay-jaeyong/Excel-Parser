"use client";

import { Bot, Sparkles, RefreshCw, Copy, Check, Trash2 } from "lucide-react";
import { useAiAnalysis } from "@/hooks/useAiAnalysis";
import { useAiChat, quickPrompts } from "@/hooks/useAiChat";
import HtmlChartPreview from "@/components/HtmlChartPreview";
import ChatPanel from "@/components/ChatPanel";

// Re-export for backward compatibility with existing page.tsx import
export type { AxisSuggestion } from "@/lib/types";

type CellValue = string | number | null;

interface Props {
    headers: string[];
    rows: CellValue[][];
    onApplyAxes: (suggestion: import("@/lib/types").AxisSuggestion) => void;
    currentAxes?: import("@/lib/types").AxisSuggestion;
}

/**
 * AI Analysis Panel — slim orchestrator.
 * State and logic live in useAiAnalysis / useAiChat hooks.
 * UI sub-components: HtmlChartPreview (left 62%) + ChatPanel (right).
 */
export default function AiAnalysisPanel({ headers, rows, onApplyAxes, currentAxes }: Props) {
    const hasData = headers.length > 0 && rows.length > 0;

    const analysis = useAiAnalysis({ headers, rows, onApplyAxes, currentAxes });

    const activeAxes = currentAxes ?? {
        xKey: analysis.analyzeResult?.x_key ?? null,
        yKeys: analysis.analyzeResult?.y_keys ?? [],
        chartType: analysis.analyzeResult?.chart_type ?? "bar",
    };

    const chat = useAiChat({
        headers,
        rows,
        activeAxes,
        htmlChart: analysis.htmlChart,
        onApplyAxes,
        setHtmlChart: analysis.setHtmlChart,
        setChartCustomOptions: analysis.setChartCustomOptions,
        chartCustomOptionsRef: analysis.chartCustomOptionsRef,
        autoGenerateHtml: analysis.autoGenerateHtml,
    });

    return (
        <div className="rounded-2xl border border-violet-700/40 bg-slate-900/60 overflow-hidden shadow-xl shadow-violet-950/20">

            {/* ── 헤더 ── */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/60 bg-slate-800/50">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-violet-600/20 ring-1 ring-violet-500/30">
                        <Bot className="w-4 h-4 text-violet-400" />
                    </div>
                    <div>
                        <h3 className="text-sm font-semibold text-slate-100">AI 차트 어시스턴트</h3>
                        <p className="text-xs text-slate-500">채팅으로 차트 데이터 · 디자인을 자유롭게 제어하세요</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {chat.history.some(m => m.role === "assistant") && (
                        <button
                            onClick={chat.handleCopyLast}
                            title="마지막 답변 복사"
                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-slate-200 text-xs transition-colors"
                        >
                            {chat.copied
                                ? <Check className="w-3.5 h-3.5 text-emerald-400" />
                                : <Copy className="w-3.5 h-3.5" />
                            }
                            {chat.copied ? "복사됨" : "복사"}
                        </button>
                    )}
                    {chat.history.length > 0 && (
                        <button
                            onClick={chat.handleClearChat}
                            title="대화 초기화"
                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-red-400 text-xs transition-colors"
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                            초기화
                        </button>
                    )}
                    <button
                        onClick={analysis.handleAnalyze}
                        disabled={!hasData || analysis.isAnalyzing || analysis.isGeneratingHtml}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-all shadow-lg shadow-indigo-900/30"
                    >
                        {(analysis.isAnalyzing || analysis.isGeneratingHtml)
                            ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            : <Sparkles className="w-3.5 h-3.5" />
                        }
                        {analysis.isAnalyzing
                            ? `분석 중${analysis.dots}`
                            : analysis.isGeneratingHtml
                                ? `차트 생성 중${analysis.dots}`
                                : "AI 자동 분석"}
                    </button>
                </div>
            </div>

            {/* ── 본문: 좌(차트 미리보기) + 우(채팅) ── */}
            <div className="flex flex-col lg:flex-row min-h-[680px]">
                <HtmlChartPreview
                    isAnalyzing={analysis.isAnalyzing}
                    analyzeError={analysis.analyzeError}
                    analyzeResult={analysis.analyzeResult}
                    isGeneratingHtml={analysis.isGeneratingHtml}
                    dots={analysis.dots}
                    htmlChart={analysis.htmlChart}
                    chartCustomOptions={analysis.chartCustomOptions}
                    showHtmlCode={analysis.showHtmlCode}
                    setShowHtmlCode={analysis.setShowHtmlCode}
                    copiedHtml={analysis.copiedHtml}
                    onCopyHtml={analysis.handleCopyHtml}
                    onResetStyle={analysis.handleResetStyle}
                    headers={headers}
                    rows={rows}
                />
                <ChatPanel
                    history={chat.history}
                    streamingText={chat.streamingText}
                    reportError={chat.reportError}
                    isStreaming={chat.isStreaming}
                    input={chat.input}
                    setInput={chat.setInput}
                    onSend={chat.sendMessage}
                    onStop={chat.handleStop}
                    onKeyDown={chat.handleKeyDown}
                    quickPrompts={quickPrompts}
                    hasData={hasData}
                    chatContainerRef={chat.chatContainerRef}
                    chatBottomRef={chat.chatBottomRef}
                    inputRef={chat.inputRef}
                />
            </div>
        </div>
    );
}

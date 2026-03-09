"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { streamReport } from "@/lib/api";
import type { ChatMessage, ChartCustomOptions, AnalyzeResult } from "@/lib/api";
import type { AxisSuggestion } from "@/lib/types";

type CellValue = string | number | null;

interface UseAiChatParams {
    headers: string[];
    rows: CellValue[][];
    activeAxes: AxisSuggestion;
    htmlChart: string | null;
    onApplyAxes: (suggestion: AxisSuggestion) => void;
    setHtmlChart: (html: string | null) => void;
    setChartCustomOptions: (opts: ChartCustomOptions) => void;
    chartCustomOptionsRef: React.MutableRefObject<ChartCustomOptions>;
    autoGenerateHtml: (result: AnalyzeResult, opts?: ChartCustomOptions) => Promise<void>;
}

export interface AiChatState {
    history: ChatMessage[];
    input: string;
    setInput: (v: string) => void;
    isStreaming: boolean;
    streamingText: string;
    reportError: string | null;
    copied: boolean;
    chatContainerRef: React.RefObject<HTMLDivElement | null>;
    chatBottomRef: React.RefObject<HTMLDivElement | null>;
    inputRef: React.RefObject<HTMLTextAreaElement | null>;
    quickPrompts: string[];
    sendMessage: () => void;
    handleStop: () => void;
    handleKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
    handleClearChat: () => void;
    handleCopyLast: () => void;
}

/**
 * 질문이 Excel 데이터 분석을 필요로 하는지 판별합니다.
 * 순수 차트 스타일 변경(색상·배경·제목 등)은 false → 테이블 컨텍스트 생략.
 * 판단 불확실 시 true(안전 기본값)를 반환합니다.
 */
export function classifyNeedsData(question: string): boolean {
    const q = question.toLowerCase();

    // 차트 시각 스타일만 다루는 키워드 — 데이터 불필요
    const styleOnly = [
        "색상", "색깔", "컬러", "color",
        "배경", "background",
        "제목", "title",
        "폰트", "글자", "글씨", "font",
        "범례", "legend",
        "투명", "opacity",
        "테두리", "border",
        "축 라벨", "축라벨", "레이블", "label",
        "그리드", "격자", "gridline",
        "두께", "크기", "사이즈",
        "스타일",
        "라인 차트", "막대 차트", "바 차트", "파이 차트", "꺾은선",
        "차트 타입", "차트 종류",
    ];

    // 이 키워드만 있고 데이터 분석 키워드가 없으면 스타일 요청으로 판단
    const dataRequired = [
        "분석", "트렌드", "추세", "이상값", "이상치", "이상",
        "통계", "평균", "최대", "최소", "합계", "합산", "총합",
        "인사이트", "요약", "정리",
        "예측", "예상",
        "비교", "차이",
        "증가", "감소", "변화", "패턴",
        "얼마", "몇", "어느", "어떤",
        "데이터", "수치", "값",
        "상관", "관계",
    ];

    const hasDataKeyword = dataRequired.some(k => q.includes(k));
    if (hasDataKeyword) return true;

    const hasStyleKeyword = styleOnly.some(k => q.includes(k));
    if (hasStyleKeyword) return false;

    // 판단 불확실 → 안전하게 데이터 주입
    return true;
}

export const quickPrompts = [
    "이 데이터의 주요 인사이트를 요약해줘",
    "이상값이나 특이사항이 있으면 알려줘",
    "데이터 트렌드를 분석해줘",
    "차트를 라인 차트로 바꿔줘",
    "차트 배경을 흰색으로 바꿔줘",
    "막대 색상을 파란색으로 변경해줘",
    "차트 제목을 '시계열 분석'으로 바꿔줘",
];

export function useAiChat({
    headers,
    rows,
    activeAxes,
    htmlChart,
    onApplyAxes,
    setHtmlChart,
    setChartCustomOptions,
    chartCustomOptionsRef,
    autoGenerateHtml,
}: UseAiChatParams): AiChatState {
    const [history, setHistory] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState("");
    const [isStreaming, setIsStreaming] = useState(false);
    const [streamingText, setStreamingText] = useState("");
    const [reportError, setReportError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    const abortRef = useRef<AbortController | null>(null);
    const chatContainerRef = useRef<HTMLDivElement>(null);
    const chatBottomRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    // Scroll to bottom on new messages
    useEffect(() => {
        const container = chatContainerRef.current;
        if (container) container.scrollTop = container.scrollHeight;
    }, [history, streamingText]);

    const sendMessage = useCallback(() => {
        const question = input.trim();
        if (!question || isStreaming) return;

        setInput("");
        setStreamingText("");
        setReportError(null);
        setIsStreaming(true);

        const newHistory: ChatMessage[] = [...history, { role: "user", content: question }];
        setHistory(newHistory);

        let accumulated = "";

        // Apply CHART_HTML / CHART_CONFIG markers from the completed LLM response
        const applyChartConfig = (text: string): string => {
            let result = text;

            // CHART_HTML: AI directly modified the full HTML
            const htmlOutputMatch = result.match(/<CHART_HTML>([\s\S]*?)<\/CHART_HTML>/);
            if (htmlOutputMatch) {
                const newHtml = htmlOutputMatch[1].trim();
                if (newHtml) {
                    setHtmlChart(newHtml);
                    chartCustomOptionsRef.current = {};
                    setChartCustomOptions({});
                }
                result = result
                    .replace(/<CHART_HTML>[\s\S]*?<\/CHART_HTML>/g, "")
                    .trimEnd();
            }

            // CHART_CONFIG: axis/type change — regenerate HTML via template
            const cfgMatch = result.match(/CHART_CONFIG:(\{[^\n]+\})/);
            if (cfgMatch) {
                try {
                    const cfg = JSON.parse(cfgMatch[1]);
                    const suggestion: AxisSuggestion = {
                        xKey: cfg.x_key ?? null,
                        yKeys: Array.isArray(cfg.y_keys) ? cfg.y_keys : [],
                        chartType: cfg.chart_type ?? "bar",
                    };
                    onApplyAxes(suggestion);
                    autoGenerateHtml({
                        can_graph: true,
                        reason: "",
                        x_key: suggestion.xKey,
                        y_keys: suggestion.yKeys,
                        chart_type: suggestion.chartType,
                    });
                } catch { /* ignore malformed */ }
                result = result.replace(/\n?CHART_CONFIG:\{[^\n]+\}/g, "").trimEnd();
            }

            return result;
        };

        // If an AI-generated HTML chart already exists, always send the full data
        // context so the LLM can see (and preserve) any row-range filtering logic
        // (e.g. rows.slice(500, 600)) embedded in the current HTML.
        const inject_data = htmlChart ? true : classifyNeedsData(question);

        abortRef.current = streamReport(
            {
                headers,
                rows,
                x_key: activeAxes.xKey,
                y_keys: activeAxes.yKeys,
                chart_type: activeAxes.chartType,
                question,
                history,
                current_html: htmlChart ?? undefined,
                inject_data,
            },
            (chunk) => {
                accumulated += chunk;
                // Mask internal markers from the live display
                const displayText = accumulated
                    .replace(/<CHART_HTML>[\s\S]*?<\/CHART_HTML>/g, "\n*(차트 업데이트 완료)*")
                    .replace(/<CHART_HTML>[\s\S]*/g, "\n*(차트 코드 생성 중...)*")
                    .replace(/\n?CHART_CONFIG:\{[^\n]+\}/g, "")
                    .replace(/\n?CHART_HTML_CONFIG:\{[^\n]+\}/g, "")
                    .trimEnd();
                setStreamingText(displayText);
            },
            () => {
                const cleaned = applyChartConfig(accumulated);
                setHistory(prev => [...prev, { role: "assistant", content: cleaned }]);
                setStreamingText("");
                setIsStreaming(false);
            },
            (err) => {
                setReportError(err);
                setIsStreaming(false);
                setHistory(prev => prev.slice(0, -1));
            },
        );
    }, [
        input,
        isStreaming,
        history,
        headers,
        rows,
        activeAxes,
        htmlChart,
        onApplyAxes,
        setHtmlChart,
        setChartCustomOptions,
        chartCustomOptionsRef,
        autoGenerateHtml,
    ]);

    const handleStop = () => {
        abortRef.current?.abort();
        if (streamingText) {
            setHistory(prev => [
                ...prev,
                { role: "assistant", content: streamingText + "\n\n*(중단됨)*" },
            ]);
        }
        setStreamingText("");
        setIsStreaming(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    const handleClearChat = () => {
        setHistory([]);
        setStreamingText("");
        setReportError(null);
    };

    const handleCopyLast = () => {
        const last = [...history].reverse().find(m => m.role === "assistant");
        if (last) {
            navigator.clipboard.writeText(last.content);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    return {
        history,
        input,
        setInput,
        isStreaming,
        streamingText,
        reportError,
        copied,
        chatContainerRef,
        chatBottomRef,
        inputRef,
        quickPrompts,
        sendMessage,
        handleStop,
        handleKeyDown,
        handleClearChat,
        handleCopyLast,
    };
}

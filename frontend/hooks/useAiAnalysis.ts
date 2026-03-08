"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { analyzeTable, getChartHtml } from "@/lib/api";
import type { AnalyzeResult, ChartCustomOptions } from "@/lib/api";
import type { AxisSuggestion } from "@/lib/types";

type CellValue = string | number | null;

interface UseAiAnalysisParams {
    headers: string[];
    rows: CellValue[][];
    onApplyAxes: (suggestion: AxisSuggestion) => void;
    currentAxes?: AxisSuggestion;
}

export interface AiAnalysisState {
    isAnalyzing: boolean;
    analyzeError: string | null;
    analyzeResult: AnalyzeResult | null;
    dots: string;
    htmlChart: string | null;
    setHtmlChart: (html: string | null) => void;
    isGeneratingHtml: boolean;
    showHtmlCode: boolean;
    setShowHtmlCode: (v: boolean | ((prev: boolean) => boolean)) => void;
    copiedHtml: boolean;
    chartCustomOptions: ChartCustomOptions;
    setChartCustomOptions: (opts: ChartCustomOptions) => void;
    chartCustomOptionsRef: React.MutableRefObject<ChartCustomOptions>;
    autoGenerateHtml: (result: AnalyzeResult, opts?: ChartCustomOptions) => Promise<void>;
    handleAnalyze: () => Promise<void>;
    handleCopyHtml: () => void;
    handleResetStyle: () => void;
}

export function useAiAnalysis({
    headers,
    rows,
    onApplyAxes,
    currentAxes,
}: UseAiAnalysisParams): AiAnalysisState {
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analyzeError, setAnalyzeError] = useState<string | null>(null);
    const [analyzeResult, setAnalyzeResult] = useState<AnalyzeResult | null>(null);
    const [dots, setDots] = useState(".");

    const [htmlChart, setHtmlChart] = useState<string | null>(null);
    const [isGeneratingHtml, setIsGeneratingHtml] = useState(false);
    const [showHtmlCode, setShowHtmlCode] = useState(false);
    const [copiedHtml, setCopiedHtml] = useState(false);

    const chartCustomOptionsRef = useRef<ChartCustomOptions>({});
    const [chartCustomOptions, setChartCustomOptions] = useState<ChartCustomOptions>({});

    // Dots animation
    useEffect(() => {
        if (!isAnalyzing && !isGeneratingHtml) return;
        const id = setInterval(() => {
            setDots(d => (d.length >= 3 ? "." : d + "."));
        }, 400);
        return () => clearInterval(id);
    }, [isAnalyzing, isGeneratingHtml]);

    const autoGenerateHtml = useCallback(
        async (result: AnalyzeResult, opts?: ChartCustomOptions) => {
            if (!result.can_graph) return;
            setIsGeneratingHtml(true);
            setHtmlChart(null);
            try {
                const { html } = await getChartHtml({
                    headers,
                    rows,
                    x_key: result.x_key,
                    y_keys: result.y_keys,
                    chart_type: result.chart_type,
                    custom_options: opts ?? chartCustomOptionsRef.current,
                });
                setHtmlChart(html);
                onApplyAxes({
                    xKey: result.x_key,
                    yKeys: result.y_keys,
                    chartType: result.chart_type,
                });
            } catch (err) {
                console.error(err);
            } finally {
                setIsGeneratingHtml(false);
            }
        },
        [headers, rows, onApplyAxes], // eslint-disable-line react-hooks/exhaustive-deps
    );

    const handleAnalyze = async () => {
        setIsAnalyzing(true);
        setAnalyzeError(null);
        setAnalyzeResult(null);
        setHtmlChart(null);
        try {
            const result = await analyzeTable(headers, rows);
            setAnalyzeResult(result);
            await autoGenerateHtml(result);
        } catch (err: unknown) {
            setAnalyzeError(err instanceof Error ? err.message : "분석 실패");
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handleCopyHtml = () => {
        if (!htmlChart) return;
        navigator.clipboard.writeText(htmlChart);
        setCopiedHtml(true);
        setTimeout(() => setCopiedHtml(false), 2000);
    };

    const handleResetStyle = () => {
        chartCustomOptionsRef.current = {};
        setChartCustomOptions({});
        const axes = currentAxes ?? {
            xKey: analyzeResult?.x_key ?? null,
            yKeys: analyzeResult?.y_keys ?? [],
            chartType: analyzeResult?.chart_type ?? "bar",
        };
        if (axes.yKeys.length > 0) {
            autoGenerateHtml(
                {
                    can_graph: true,
                    reason: "",
                    x_key: axes.xKey,
                    y_keys: axes.yKeys,
                    chart_type: axes.chartType,
                },
                {},
            );
        }
    };

    return {
        isAnalyzing,
        analyzeError,
        analyzeResult,
        dots,
        htmlChart,
        setHtmlChart,
        isGeneratingHtml,
        showHtmlCode,
        setShowHtmlCode,
        copiedHtml,
        chartCustomOptions,
        setChartCustomOptions,
        chartCustomOptionsRef,
        autoGenerateHtml,
        handleAnalyze,
        handleCopyHtml,
        handleResetStyle,
    };
}

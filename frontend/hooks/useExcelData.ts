"use client";

import { useState, useCallback } from "react";
import { CheckCircle, AlertTriangle } from "lucide-react";
import { uploadExcel, getChartData } from "@/lib/api";
import type { ParsedTable, ChartData } from "@/lib/api";
import type { AxisSuggestion } from "@/lib/types";

type CellValue = string | number | null;

export interface ExcelDataState {
    isUploading: boolean;
    uploadError: string | null;
    table: ParsedTable | null;
    headers: string[];
    rows: CellValue[][];
    chart: ChartData | null;
    isChartLoading: boolean;
    showRawData: boolean;
    setShowRawData: (v: boolean | ((prev: boolean) => boolean)) => void;
    axisHint: AxisSuggestion | null;
    setAxisHint: (hint: AxisSuggestion | null) => void;
    chartAxes: { xKey: string | null; yKeys: string[] };
    setChartAxes: (axes: { xKey: string | null; yKeys: string[] }) => void;
    uploadedFile: File | null;
    sheetNames: string[];
    activeSheet: string;
    handleUpload: (file: File) => Promise<void>;
    handleSheetChange: (sheetName: string) => Promise<void>;
    handleDataChange: (newHeaders: string[], newRows: CellValue[][]) => void;
    handleGenerateChart: () => Promise<void>;
    handleReset: () => void;
    confidenceBadge: {
        color: string;
        label: string;
        Icon: React.ElementType;
    } | null;
}

export function useExcelData(): ExcelDataState {
    const [isUploading, setIsUploading] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [table, setTable] = useState<ParsedTable | null>(null);
    const [headers, setHeaders] = useState<string[]>([]);
    const [rows, setRows] = useState<CellValue[][]>([]);
    const [chart, setChart] = useState<ChartData | null>(null);
    const [isChartLoading, setIsChartLoading] = useState(false);
    const [showRawData, setShowRawData] = useState(false);
    const [axisHint, setAxisHint] = useState<AxisSuggestion | null>(null);
    const [chartAxes, setChartAxes] = useState<{ xKey: string | null; yKeys: string[] }>({ xKey: null, yKeys: [] });
    const [uploadedFile, setUploadedFile] = useState<File | null>(null);
    const [sheetNames, setSheetNames] = useState<string[]>([]);
    const [activeSheet, setActiveSheet] = useState<string>("");

    const applyParseResult = useCallback(async (result: ParsedTable) => {
        setTable(result);
        setHeaders(result.headers);
        setRows(result.rows as CellValue[][]);
        setSheetNames(result.sheet_names);
        setActiveSheet(result.active_sheet);
        setAxisHint(null);
        setChartAxes({ xKey: null, yKeys: [] });

        const chartResult = await getChartData(result.headers, result.rows as CellValue[][]);
        setChart(chartResult);
    }, []);

    const handleUpload = useCallback(async (file: File) => {
        setIsUploading(true);
        setUploadError(null);
        setTable(null);
        setChart(null);
        setUploadedFile(file);
        try {
            const result = await uploadExcel(file);
            await applyParseResult(result);
        } catch (err: unknown) {
            setUploadError(err instanceof Error ? err.message : "An unexpected error occurred.");
        } finally {
            setIsUploading(false);
        }
    }, [applyParseResult]);

    const handleSheetChange = useCallback(async (sheetName: string) => {
        if (!uploadedFile || sheetName === activeSheet) return;
        setIsUploading(true);
        setUploadError(null);
        setChart(null);
        try {
            const result = await uploadExcel(uploadedFile, sheetName);
            await applyParseResult(result);
        } catch (err: unknown) {
            setUploadError(err instanceof Error ? err.message : "An unexpected error occurred.");
        } finally {
            setIsUploading(false);
        }
    }, [uploadedFile, activeSheet, applyParseResult]);

    const handleDataChange = useCallback((newHeaders: string[], newRows: CellValue[][]) => {
        setHeaders(newHeaders);
        setRows(newRows);
    }, []);

    const handleGenerateChart = useCallback(async () => {
        setIsChartLoading(true);
        try {
            const result = await getChartData(headers, rows);
            setChart(result);
        } catch (err: unknown) {
            console.error("Chart error:", err);
        } finally {
            setIsChartLoading(false);
        }
    }, [headers, rows]);

    const handleReset = useCallback(() => {
        setTable(null);
        setHeaders([]);
        setRows([]);
        setChart(null);
        setUploadError(null);
        setShowRawData(false);
        setAxisHint(null);
        setUploadedFile(null);
        setSheetNames([]);
        setActiveSheet("");
    }, []);

    const confidenceBadge = table
        ? table.confidence >= 0.8
            ? { color: "text-emerald-400 bg-emerald-950/40 border-emerald-800", label: "High confidence", Icon: CheckCircle }
            : table.confidence >= 0.5
                ? { color: "text-amber-400 bg-amber-950/40 border-amber-800", label: "Medium confidence", Icon: AlertTriangle }
                : { color: "text-red-400 bg-red-950/40 border-red-800", label: "Low confidence — LLM used", Icon: AlertTriangle }
        : null;

    return {
        isUploading,
        uploadError,
        table,
        headers,
        rows,
        chart,
        isChartLoading,
        showRawData,
        setShowRawData,
        axisHint,
        setAxisHint,
        chartAxes,
        setChartAxes,
        uploadedFile,
        sheetNames,
        activeSheet,
        handleUpload,
        handleSheetChange,
        handleDataChange,
        handleGenerateChart,
        handleReset,
        confidenceBadge,
    };
}

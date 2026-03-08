"use client";

import { useState, useRef, useEffect, MouseEvent as ReactMouseEvent } from "react";
import { ChartData } from "@/lib/api";
import {
    BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { BarChart2, LineChartIcon, PieChartIcon, ZoomIn, ChevronLeft, ChevronRight, Search, X, ArrowLeftRight } from "lucide-react";

type ChartType = "bar" | "line" | "pie";

interface Props {
    chartData: ChartData;
    /** When set, AI suggestion will auto-update X/Y axes and chart type */
    externalAxes?: { xKey: string | null; yKeys: string[]; chartType: string } | null;
    /** Called whenever the user changes the selected X or Y axes */
    onAxesChange?: (xKey: string | null, yKeys: string[]) => void;
}

const PALETTE = [
    "#818cf8", "#34d399", "#fb923c", "#f472b6",
    "#38bdf8", "#facc15", "#a78bfa", "#4ade80",
];

const CHART_TYPES: { type: ChartType; Icon: React.ElementType; label: string }[] = [
    { type: "bar", Icon: BarChart2, label: "Bar" },
    { type: "line", Icon: LineChartIcon, label: "Line" },
    { type: "pie", Icon: PieChartIcon, label: "Pie" },
];

/**
 * Compact number formatter for Y-axis ticks.
 * Uses Korean units for large numbers: 조 / 억 / 만
 */
function formatYAxisTick(value: number): string {
    if (typeof value !== "number" || isNaN(value)) return String(value);
    const abs = Math.abs(value);
    const sign = value < 0 ? "-" : "";
    if (abs >= 1_000_000_000_000) {
        const v = abs / 1_000_000_000_000;
        return `${sign}${v % 1 === 0 ? v : v.toFixed(1)}조`;
    }
    if (abs >= 100_000_000) {
        const v = abs / 100_000_000;
        return `${sign}${v % 1 === 0 ? v : v.toFixed(1)}억`;
    }
    if (abs >= 10_000) {
        const v = abs / 10_000;
        return `${sign}${v % 1 === 0 ? v : v.toFixed(1)}만`;
    }
    if (abs >= 1_000) {
        return `${sign}${abs.toLocaleString()}`;
    }
    return String(value);
}

export default function DataChart({ chartData, externalAxes, onAxesChange }: Props) {
    const { data, labelKey: initialLabelKey, numericKeys: initialNumericKeys } = chartData;

    const [chartType, setChartType] = useState<ChartType>(
        chartData.suggestedType as ChartType
    );
    const [selectedLabelKey, setSelectedLabelKey] = useState<string | null>(null);
    // 기본값: 선택 해제 상태
    const [selectedYKeys, setSelectedYKeys] = useState<string[]>([]);
    const [showSeriesList, setShowSeriesList] = useState(false);
    const [ySearch, setYSearch] = useState("");
    
    // ── Pagination state ───────────────────────────────────────────
    const rowsPerPage = 30;
    const [currentPage, setCurrentPage] = useState(1);
    const [showAllData, setShowAllData] = useState(false);
    
    // ── Y-axis range selection ─────────────────────────────────────
    const [yAxisMin, setYAxisMin] = useState<number | null>(null);
    const [yAxisMax, setYAxisMax] = useState<number | null>(null);
    
    // ── Chart zoom/pan state ───────────────────────────────────────
    const [chartDataSlice, setChartDataSlice] = useState<number[]>([0, data.length - 1]);

    // 페이지 변경 또는 전체 보기 전환 시 zoom 리셋
    useEffect(() => {
        setChartDataSlice([0, data.length - 1]);
        setChartDragRange(null);
        isChartDragging.current = false;
        chartDragStart.current = null;
    }, [currentPage, showAllData]);

    // Apply external axis suggestion from AI panel
    useEffect(() => {
        if (!externalAxes) return;
        if (externalAxes.xKey) setSelectedLabelKey(externalAxes.xKey);
        if (externalAxes.yKeys.length > 0) {
            setSelectedYKeys(externalAxes.yKeys.filter(k => data[0] && k in data[0]));
        }
        const ct = externalAxes.chartType as ChartType;
        if (["bar", "line", "pie"].includes(ct)) setChartType(ct);
    }, [externalAxes]); // eslint-disable-line react-hooks/exhaustive-deps

    // Notify parent whenever selected axes change
    useEffect(() => {
        onAxesChange?.(selectedLabelKey, selectedYKeys);
    }, [selectedLabelKey, selectedYKeys]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Drag range selection state ──────────────────────────────────
    const isDraggingYAxis = useRef(false);
    const dragStartIdx = useRef<number | null>(null);
    const dragStartPos = useRef<{ x: number; y: number } | null>(null);
    const dragMode = useRef<"select" | "deselect">("select");
    const [dragHighlight, setDragHighlight] = useState<Set<number>>(new Set());
    const yAxisContainerRef = useRef<HTMLDivElement>(null);
    
    // ── Chart drag selection ────────────────────────────────────────
    const isChartDragging = useRef(false);
    const chartDragStart = useRef<{ x: number; idx: number; pct: number } | null>(null);
    const [chartDragRange, setChartDragRange] = useState<{ start: number; end: number; leftPct: number; rightPct: number } | null>(null);
    const chartContainerRef = useRef<HTMLDivElement>(null);

    if (!data.length || !initialNumericKeys.length) {
        return (
            <div className="flex items-center justify-center h-64 text-slate-500 text-sm rounded-xl border border-slate-700 bg-slate-800/40">
                No numeric data available to chart.
            </div>
        );
    }

    // Available keys for selection
    const allKeys = Object.keys(data[0] || {});
    // Y-Axis selectable keys = all keys except selected X-Axis
    const yAxisOptions = allKeys.filter(k => k !== selectedLabelKey);
    // 검색 필터 적용
    const filteredYOptions = ySearch
        ? yAxisOptions.filter(k => k.toLowerCase().includes(ySearch.toLowerCase()))
        : yAxisOptions;

    // 파이차트: selectedYKeys[0] 사용
    const pieKey = selectedYKeys[0] || initialNumericKeys[0] || Object.keys(data[0] || {})[0] || "";
    const pieData = data.map((d) => ({
        name: String(d[selectedLabelKey ?? ""] ?? ""),
        value: Number(d[pieKey] ?? 0),
    }));

    // X ↔ Y 스왑 핸들러
    const handleSwapAxes = () => {
        const firstY = selectedYKeys[0] ?? null;
        const oldX = selectedLabelKey;
        // new Y = [old X, ...rest of Y] (old X 에 null이면 개수만 줄임)
        const restY = selectedYKeys.slice(1);
        const newYKeys = (oldX ? [oldX, ...restY] : restY);
        setSelectedLabelKey(firstY);
        setSelectedYKeys(newYKeys);
    };

    const toggleYKey = (key: string) => {
        setSelectedYKeys(prev =>
            prev.includes(key)
                ? prev.filter(k => k !== key)
                : [...prev, key]
        );
    };

    // ── Y-Axis drag handlers ────────────────────────────────────────
    const rangeIndices = (a: number, b: number) => {
        const lo = Math.min(a, b), hi = Math.max(a, b);
        return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
    };

    const handleYAxisMouseDown = (idx: number, e: ReactMouseEvent) => {
        dragStartPos.current = { x: e.clientX, y: e.clientY };
        isDraggingYAxis.current = true;
        dragStartIdx.current = idx;
        dragMode.current = selectedYKeys.includes(filteredYOptions[idx]) ? "deselect" : "select";
        setDragHighlight(new Set([idx]));
    };

    const handleYAxisMouseEnter = (idx: number, e: ReactMouseEvent) => {
        if (!isDraggingYAxis.current || dragStartIdx.current === null || !dragStartPos.current) return;
        const dist = Math.hypot(e.clientX - dragStartPos.current.x, e.clientY - dragStartPos.current.y);
        if (dist > 5) {
            setDragHighlight(new Set(rangeIndices(dragStartIdx.current, idx)));
        }
    };

    const handleYAxisMouseUp = () => {
        if (!isDraggingYAxis.current || dragStartIdx.current === null) {
            isDraggingYAxis.current = false;
            setDragHighlight(new Set());
            dragStartPos.current = null;
            return;
        }

        if (dragHighlight.size === 1) {
            toggleYKey(filteredYOptions[dragStartIdx.current]);
        } else {
            const highlighted = Array.from(dragHighlight);
            const keysInRange = highlighted.map(i => filteredYOptions[i]).filter(Boolean);
            setSelectedYKeys(prev => {
                if (dragMode.current === "select") {
                    return Array.from(new Set([...prev, ...keysInRange]));
                } else {
                    const removeSet = new Set(keysInRange);
                    return prev.filter(k => !removeSet.has(k));
                }
            });
        }

        isDraggingYAxis.current = false;
        dragStartIdx.current = null;
        dragStartPos.current = null;
        setDragHighlight(new Set());
    };

    // ── Chart drag zoom handlers ────────────────────────────────────
    const handleChartMouseDown = (e: React.MouseEvent) => {
        if (chartType === "pie") return;
        e.preventDefault(); // 드래그 중 텍스트 선택 방지

        const rect = chartContainerRef.current?.getBoundingClientRect();
        if (!rect) return;

        const x = e.clientX - rect.left;
        const ratio = Math.max(0, Math.min(1, x / rect.width));
        // 현재 표시 중인 범위 길이 (줌 적용 후)
        const currentLen = chartDataSlice[1] - chartDataSlice[0] + 1;
        // displayData 내 로컬 인덱스 → paginatedData 절대 인덱스
        const localIdx = Math.floor(ratio * currentLen);
        const absIdx = chartDataSlice[0] + Math.max(0, Math.min(currentLen - 1, localIdx));

        isChartDragging.current = true;
        chartDragStart.current = { x: e.clientX, idx: absIdx, pct: ratio };
    };

    const handleChartMouseMove = (e: React.MouseEvent) => {
        if (!isChartDragging.current || !chartDragStart.current) return;

        const rect = chartContainerRef.current?.getBoundingClientRect();
        if (!rect) return;

        const x = e.clientX - rect.left;
        const ratio = Math.max(0, Math.min(1, x / rect.width));
        const currentLen = chartDataSlice[1] - chartDataSlice[0] + 1;
        const localIdx = Math.floor(ratio * currentLen);
        const absIdx = chartDataSlice[0] + Math.max(0, Math.min(currentLen - 1, localIdx));

        const startAbsIdx = chartDragStart.current.idx;
        const startPct = chartDragStart.current.pct;
        const leftPct = Math.min(startPct, ratio) * 100;
        const rightPct = (1 - Math.max(startPct, ratio)) * 100;

        setChartDragRange({
            start: Math.min(startAbsIdx, absIdx),
            end: Math.max(startAbsIdx, absIdx),
            leftPct,
            rightPct,
        });
    };

    const handleChartMouseUp = () => {
        if (!isChartDragging.current || !chartDragRange) {
            isChartDragging.current = false;
            chartDragStart.current = null;
            setChartDragRange(null);
            return;
        }

        // Apply zoom
        setChartDataSlice([chartDragRange.start, chartDragRange.end]);
        isChartDragging.current = false;
        chartDragStart.current = null;
        setChartDragRange(null);
    };

    const resetChartZoom = () => {
        setChartDataSlice([0, paginatedData.length - 1]);
        setChartDragRange(null);
    };

    const selectAll = () => setSelectedYKeys([...yAxisOptions]);
    const selectNone = () => setSelectedYKeys([]);
    const selectAllFiltered = () => setSelectedYKeys(prev => Array.from(new Set([...prev, ...filteredYOptions])));
    const deselectAllFiltered = () => { const rm = new Set(filteredYOptions); setSelectedYKeys(prev => prev.filter(k => !rm.has(k))); };

    // Slice data for display based on pagination
    const totalPages = Math.ceil(data.length / rowsPerPage);
    const paginatedData = showAllData
        ? data
        : data.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);
    const displayData = paginatedData.slice(chartDataSlice[0], chartDataSlice[1] + 1);
    const isZoomed = chartDataSlice[0] > 0 || chartDataSlice[1] < paginatedData.length - 1;

    return (
        <div className="w-full flex flex-col gap-6">
            {/* ── 상단 컨트롤: Chart Type | X축 ↔ Y축 | Y범위 ── */}
            <div className="grid grid-cols-1 md:grid-cols-[auto_1fr_auto] gap-4 items-end">
                {/* Chart Type */}
                <div className="flex flex-col gap-2">
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Chart Type</label>
                    <div className="flex gap-2 flex-wrap">
                        {CHART_TYPES.map(({ type, Icon, label }) => (
                            <button
                                key={type}
                                onClick={() => setChartType(type)}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${chartType === type
                                    ? "bg-indigo-600 text-white shadow-lg shadow-indigo-900/40"
                                    : "bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200"
                                    }`}
                            >
                                <Icon className="w-4 h-4" />
                                {label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* X-Axis + Swap + Y-Axis 나란히 */}
                <div className="flex gap-4">
                    {/* X-Axis */}
                    <div className="flex flex-col gap-1.5 flex-1">
                        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">X-Axis (Labels)</label>
                        <select
                            value={selectedLabelKey || ""}
                            onChange={(e) => {
                                const newLabel = e.target.value;
                                setSelectedYKeys(prev => prev.filter(k => k !== newLabel));
                                setSelectedLabelKey(newLabel || null);
                            }}
                            className="w-full bg-slate-800 text-slate-200 border border-slate-700 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                            <option value="">No select</option>
                            {allKeys.map(key => (
                                <option key={key} value={key}>{key}</option>
                            ))}
                        </select>
                    </div>

                    {/* Swap 버튼 */}
                    <div className="flex flex-col justify-end pb-0.5">
                        <button
                            onClick={handleSwapAxes}
                            disabled={!selectedLabelKey && selectedYKeys.length === 0}
                            title="X축과 첫 번째 Y축 교환"
                            className="flex items-center justify-center h-9 px-2.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-indigo-300 hover:border-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >
                            <ArrowLeftRight className="w-3.5 h-3.5" />
                        </button>
                    </div>

                    {/* Y-Axis (Primary) */}
                    <div className="flex flex-col gap-1.5 flex-1">
                        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Y-Axis</label>
                        <div className="flex gap-1.5">
                            <select
                                value={selectedYKeys[0] || ""}
                                onChange={(e) => {
                                    const val = e.target.value;
                                    if (!val) { setSelectedYKeys([]); return; }
                                    if (!showSeriesList) {
                                        // 단일 모드: 기존 선택을 대체
                                        setSelectedYKeys([val]);
                                    } else {
                                        // 멀티 모드: 선택항목을 맨 앞으로 이동
                                        setSelectedYKeys(prev => {
                                            const others = prev.filter(k => k !== val);
                                            return [val, ...others];
                                        });
                                    }
                                }}
                                className="flex-1 bg-slate-800 text-slate-200 border border-slate-700 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            >
                                <option value="">No select</option>
                                {yAxisOptions.map(k => (
                                    <option key={k} value={k}>{k}</option>
                                ))}
                            </select>
                            <button
                                onClick={() => {
                                    if (showSeriesList) {
                                        // 닫히면 단일 모드 전환: Y축 선택항목을 1개로 제한
                                        setSelectedYKeys(prev => prev.slice(0, 1));
                                    }
                                    setShowSeriesList(s => !s);
                                }}
                                title="멀티 시리즈 관리"
                                className={`flex items-center justify-center h-9 px-2.5 rounded-lg border text-xs transition-colors ${
                                    showSeriesList
                                        ? "bg-indigo-600/20 border-indigo-500/40 text-indigo-300"
                                        : "bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200"
                                }`}
                            >
                                {showSeriesList ? "닫기" : "멀티"}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Y-Axis Range */}
                <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Y Range</label>
                    <div className="flex gap-1.5">
                        <input
                            type="number"
                            placeholder="Min"
                            value={yAxisMin ?? ""}
                            onChange={(e) => setYAxisMin(e.target.value ? parseFloat(e.target.value) : null)}
                            className="w-20 bg-slate-800 text-slate-200 border border-slate-700 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                        <input
                            type="number"
                            placeholder="Max"
                            value={yAxisMax ?? ""}
                            onChange={(e) => setYAxisMax(e.target.value ? parseFloat(e.target.value) : null)}
                            className="w-20 bg-slate-800 text-slate-200 border border-slate-700 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                    </div>
                </div>
            </div>

            {/* ── 멀티 시리즈 관리 (접기/펼치기) ── */}
            {showSeriesList && (
            <div className="flex flex-col gap-2 p-3 rounded-xl border border-slate-700 bg-slate-800/30">
                <div className="flex items-center justify-between flex-wrap gap-2">
                    <span className="text-xs text-slate-500">{selectedYKeys.length} / {yAxisOptions.length} 선택됨</span>
                    <div className="flex gap-2 text-xs">
                        <button onClick={selectAll} className="text-indigo-400 hover:text-indigo-300 transition-colors">전체 선택</button>
                        <span className="text-slate-700">/</span>
                        <button onClick={selectNone} className="text-indigo-400 hover:text-indigo-300 transition-colors">전체 해제</button>
                        {ySearch && (<>
                            <span className="text-slate-700">/</span>
                            <button onClick={selectAllFiltered} className="text-emerald-400 hover:text-emerald-300 transition-colors">검색결과 선택</button>
                            <span className="text-slate-700">/</span>
                            <button onClick={deselectAllFiltered} className="text-red-400 hover:text-red-300 transition-colors">검색결과 해제</button>
                        </>)}
                    </div>
                </div>

                {/* 시리즈 검색 + 태그 */}
                {true && (
                    <>
                        <div className="relative mt-2">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
                            <input
                                type="text"
                                placeholder="Y축 항목 검색..."
                                value={ySearch}
                                onChange={e => setYSearch(e.target.value)}
                                className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-8 pr-8 py-1.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                            {ySearch && (
                                <button
                                    onClick={() => setYSearch("")}
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </div>

                        <div
                            ref={yAxisContainerRef}
                            className="flex gap-1.5 flex-wrap select-none max-h-48 overflow-y-auto pr-1 mt-2"
                            onMouseLeave={handleYAxisMouseUp}
                            onMouseUp={handleYAxisMouseUp}
                        >
                            {filteredYOptions.length === 0 && (
                                <p className="text-xs text-slate-500 py-2">검색 결과 없음</p>
                            )}
                            {filteredYOptions.map((key, idx) => {
                                const isSelected = selectedYKeys.includes(key);
                                const isHighlighted = dragHighlight.has(idx);
                                const willSelect = dragMode.current === "select";
                                let style: string;
                                if (isHighlighted && isDraggingYAxis.current) {
                                    style = willSelect
                                        ? "bg-emerald-600/60 text-white ring-1 ring-emerald-400"
                                        : "bg-red-600/40 text-red-200 ring-1 ring-red-400 line-through";
                                } else if (isSelected) {
                                    style = "bg-emerald-600 text-white shadow-lg shadow-emerald-900/40 cursor-pointer";
                                } else {
                                    style = "bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200 cursor-pointer";
                                }
                                return (
                                    <button
                                        key={key}
                                        onMouseDown={(e) => handleYAxisMouseDown(idx, e)}
                                        onMouseEnter={(e) => handleYAxisMouseEnter(idx, e)}
                                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${style}`}
                                    >
                                        {key}
                                    </button>
                                );
                            })}
                        </div>
                    </>
                )}
            </div>
            )}

            {/* Chart */}
            <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                    {isZoomed && (
                        <button
                            onClick={resetChartZoom}
                            className="flex items-center gap-1.5 px-3 py-1 text-xs text-amber-400 hover:text-amber-300 transition-colors"
                        >
                            <ZoomIn className="w-3.5 h-3.5" />
                            Reset zoom
                        </button>
                    )}
                    {chartType !== "pie" && (
                        <p className="text-xs text-slate-500 ml-auto">
                            Drag on chart to zoom into range
                        </p>
                    )}
                </div>
                <div
                    ref={chartContainerRef}
                    className="w-full h-96 bg-slate-900/60 rounded-xl border border-slate-700 p-6 relative select-none"
                    style={{ cursor: isChartDragging.current ? 'col-resize' : 'crosshair' }}
                    onMouseDown={handleChartMouseDown}
                    onMouseMove={handleChartMouseMove}
                    onMouseUp={handleChartMouseUp}
                    onMouseLeave={handleChartMouseUp}
                >
                    {selectedYKeys.length === 0 ? (
                        <div className="flex items-center justify-center h-full text-slate-500">
                            Please select at least one data series.
                        </div>
                    ) : (
                        <>
                            {/* Drag range overlay */}
                            {chartDragRange && (
                                <div
                                    className="absolute top-6 bottom-6 pointer-events-none rounded transition-none"
                                    style={{
                                        left: `calc(${chartDragRange.leftPct}% + 24px)`,
                                        right: `calc(${chartDragRange.rightPct}% + 24px)`,
                                        background: 'rgba(99,102,241,0.18)',
                                        borderLeft: '2px solid #818cf8',
                                        borderRight: '2px solid #818cf8',
                                    }}
                                >
                                    <div className="absolute top-1 left-1/2 -translate-x-1/2 text-[10px] text-indigo-300 bg-slate-900/80 px-1.5 py-0.5 rounded whitespace-nowrap">
                                        드래그 → 확대
                                    </div>
                                </div>
                            )}
                            <ResponsiveContainer width="100%" height="100%">
                                {chartType === "bar" ? (
                                    <BarChart data={displayData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                                        <XAxis
                                            dataKey={selectedLabelKey ?? undefined}
                                            tick={{ fill: "#94a3b8", fontSize: 12 }}
                                            axisLine={{ stroke: "#475569" }}
                                        />
                                        <YAxis 
                                            domain={yAxisMin !== null && yAxisMax !== null ? [yAxisMin, yAxisMax] : undefined}
                                            tick={{ fill: "#94a3b8", fontSize: 12 }} 
                                            axisLine={{ stroke: "#475569" }}
                                            tickFormatter={formatYAxisTick}
                                            width={72}
                                        />
                                        <Tooltip
                                            contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8 }}
                                            labelStyle={{ color: "#e2e8f0" }}
                                            itemStyle={{ color: "#94a3b8" }}
                                        />
                                        <Legend wrapperStyle={{ color: "#94a3b8", fontSize: 12 }} />
                                        {selectedYKeys.map((key, i) => (
                                            <Bar key={key} dataKey={key} fill={PALETTE[i % PALETTE.length]} radius={[4, 4, 0, 0]} />
                                        ))}
                                    </BarChart>
                                ) : chartType === "line" ? (
                                    <LineChart data={displayData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                                        <XAxis
                                            dataKey={selectedLabelKey ?? undefined}
                                            tick={{ fill: "#94a3b8", fontSize: 12 }}
                                            axisLine={{ stroke: "#475569" }}
                                        />
                                        <YAxis 
                                            domain={yAxisMin !== null && yAxisMax !== null ? [yAxisMin, yAxisMax] : undefined}
                                            tick={{ fill: "#94a3b8", fontSize: 12 }} 
                                            axisLine={{ stroke: "#475569" }}
                                            tickFormatter={formatYAxisTick}
                                            width={72}
                                        />
                                        <Tooltip
                                            contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8 }}
                                            labelStyle={{ color: "#e2e8f0" }}
                                            itemStyle={{ color: "#94a3b8" }}
                                        />
                                        <Legend wrapperStyle={{ color: "#94a3b8", fontSize: 12 }} />
                                        {selectedYKeys.map((key, i) => (
                                            <Line
                                                key={key}
                                                type="monotone"
                                                dataKey={key}
                                                stroke={PALETTE[i % PALETTE.length]}
                                                strokeWidth={2}
                                                dot={{ r: 4, fill: PALETTE[i % PALETTE.length] }}
                                                activeDot={{ r: 6 }}
                                            />
                                        ))}
                                    </LineChart>
                                ) : (
                                    <PieChart>
                                        <Pie
                                            data={pieData}
                                            dataKey="value"
                                            nameKey="name"
                                            cx="50%"
                                            cy="50%"
                                            outerRadius="70%"
                                            label={({ name, percent }) =>
                                                `${name} (${((percent ?? 0) * 100).toFixed(1)}%)`
                                            }
                                            labelLine={false}
                                        >
                                            {pieData.map((_, i) => (
                                                <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                                            ))}
                                        </Pie>
                                        <Tooltip
                                            contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8 }}
                                            itemStyle={{ color: "#94a3b8" }}
                                        />
                                        <Legend wrapperStyle={{ color: "#94a3b8", fontSize: 12 }} />
                                    </PieChart>
                                )}
                            </ResponsiveContainer>
                        </>
                    )}
                </div>
            </div>

            {/* Pagination — 전체 보기 + 페이지 버튼 항상 한 줄 */}
            {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 flex-wrap">
                    {/* 전체 보기 토글 */}
                    <button
                        onClick={() => { setShowAllData(p => !p); setCurrentPage(1); }}
                        className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                            showAllData
                                ? "bg-indigo-600/20 border-indigo-500/40 text-indigo-300"
                                : "bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200"
                        }`}
                    >
                        전체 보기
                    </button>

                    {/* 구분선 */}
                    <span className="text-slate-700">|</span>

                    {/* 이전 버튼 */}
                    <button
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={showAllData || currentPage === 1}
                        className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                    >
                        <ChevronLeft className="w-4 h-4" />
                    </button>

                    {/* 페이지 번호 버튼 */}
                    <div className="flex gap-1">
                        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                            let pageNum: number;
                            if (totalPages <= 5) pageNum = i + 1;
                            else if (currentPage <= 3) pageNum = i + 1;
                            else if (currentPage >= totalPages - 2) pageNum = totalPages - 4 + i;
                            else pageNum = currentPage - 2 + i;
                            return (
                                <button
                                    key={pageNum}
                                    onClick={() => { if (!showAllData) setCurrentPage(pageNum); }}
                                    className={`px-3 py-1 rounded-lg text-sm font-medium transition-all ${
                                        !showAllData && currentPage === pageNum
                                            ? "bg-indigo-600 text-white"
                                            : showAllData
                                                ? "bg-slate-800/40 text-slate-600 cursor-default"
                                                : "bg-slate-800 text-slate-400 hover:bg-slate-700"
                                    }`}
                                >
                                    {pageNum}
                                </button>
                            );
                        })}
                    </div>

                    {/* 다음 버튼 */}
                    <button
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={showAllData || currentPage === totalPages}
                        className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                    >
                        <ChevronRight className="w-4 h-4" />
                    </button>

                    {/* 페이지 정보 */}
                    <span className="text-xs text-slate-500 ml-1">
                        {showAllData
                            ? `전체 ${data.length}행`
                            : `Page ${currentPage} / ${totalPages} (${data.length} rows)`
                        }
                    </span>
                </div>
            )}
        </div>
    );
}

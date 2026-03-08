"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, List } from "lucide-react";

type CellValue = string | number | null;

interface ColumnStat {
    column: string;
    total: number;
    count: number;          // non-null 건수
    nullCount: number;
    isNumeric: boolean;
    min?: number;
    max?: number;
    mean?: number;
    sum?: number;
    stdDev?: number;
    uniqueCount?: number;   // 문자열 컬럼 전용
}

interface Props {
    headers: string[];
    rows: CellValue[][];
    /** When provided, only show stats for these columns */
    selectedKeys?: string[];
}

function computeStats(headers: string[], rows: CellValue[][]): ColumnStat[] {
    return headers.map((col, ci) => {
        const values = rows.map((r) => r[ci] ?? null);
        const nonNull = values.filter((v) => v !== null && v !== "");
        const total = values.length;
        const count = nonNull.length;
        const nullCount = total - count;

        const nums = nonNull
            .map((v) => (typeof v === "number" ? v : Number(v)))
            .filter((n) => !isNaN(n));

        const isNumeric = nums.length > 0 && nums.length === nonNull.length;

        if (isNumeric && nums.length > 0) {
            const sum = nums.reduce((a, b) => a + b, 0);
            const mean = sum / nums.length;
            const variance =
                nums.reduce((a, b) => a + (b - mean) ** 2, 0) / nums.length;
            return {
                column: col,
                total,
                count,
                nullCount,
                isNumeric: true,
                min: Math.min(...nums),
                max: Math.max(...nums),
                mean,
                sum,
                stdDev: Math.sqrt(variance),
            };
        } else {
            const unique = new Set(nonNull.map(String)).size;
            return {
                column: col,
                total,
                count,
                nullCount,
                isNumeric: false,
                uniqueCount: unique,
            };
        }
    });
}

const fmt = (n: number | undefined) => {
    if (n === undefined) return "—";
    return Number.isInteger(n) ? n.toLocaleString() : n.toLocaleString(undefined, { maximumFractionDigits: 4 });
};

const COLS_PER_PAGE = 10;

export default function StatsTable({ headers, rows, selectedKeys }: Props) {
    const allStats = useMemo(() => computeStats(headers, rows), [headers, rows]);

    // Filter to selected columns when provided (and non-empty)
    const stats = useMemo(() => {
        if (!selectedKeys || selectedKeys.length === 0) return allStats;
        const keySet = new Set(selectedKeys);
        return allStats.filter(s => keySet.has(s.column));
    }, [allStats, selectedKeys]);

    const [showAll, setShowAll] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);

    const totalPages = Math.ceil(stats.length / COLS_PER_PAGE);
    const displayStats = showAll
        ? stats
        : stats.slice((currentPage - 1) * COLS_PER_PAGE, currentPage * COLS_PER_PAGE);

    return (
        <div className="flex flex-col gap-3">
            {/* Toolbar */}
            <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="text-xs text-slate-500">
                    {stats.length}개 컬럼
                    {selectedKeys && selectedKeys.length > 0 && allStats.length !== stats.length && (
                        <span className="text-slate-600"> (전체 {allStats.length}개 중 선택)</span>
                    )}
                    {" · "}{rows.length}개 행
                    {!showAll && totalPages > 1 && (
                        <span className="ml-1">· 페이지 {currentPage} / {totalPages}</span>
                    )}
                </span>
                <div className="flex items-center gap-3">
                    {totalPages > 1 && (
                        <button
                            onClick={() => { setShowAll(p => !p); setCurrentPage(1); }}
                            className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border transition-colors ${
                                showAll
                                    ? "bg-indigo-600/20 border-indigo-500/40 text-indigo-300"
                                    : "bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200"
                            }`}
                        >
                            <List className="w-3 h-3" />
                            {showAll ? "페이지 보기" : "전체 보기"}
                        </button>
                    )}
                </div>
            </div>

            {/* Table */}
            <div className="w-full overflow-x-auto rounded-xl border border-slate-700 shadow-lg">
                <table className="w-full text-sm border-collapse">
                    <thead>
                        <tr className="bg-slate-900 text-left">
                            <th className="px-4 py-3 font-semibold text-slate-300 border-b border-slate-700 whitespace-nowrap sticky left-0 bg-slate-900 z-10">컬럼</th>
                            <th className="px-4 py-3 font-semibold text-slate-300 border-b border-slate-700 whitespace-nowrap">총 행</th>
                            <th className="px-4 py-3 font-semibold text-slate-300 border-b border-slate-700 whitespace-nowrap">비어있음</th>
                            <th className="px-4 py-3 font-semibold text-slate-300 border-b border-slate-700 whitespace-nowrap">유효값</th>
                            <th className="px-4 py-3 font-semibold text-slate-300 border-b border-slate-700 whitespace-nowrap">타입</th>
                            <th className="px-4 py-3 font-semibold text-slate-300 border-b border-slate-700 whitespace-nowrap">최솟값</th>
                            <th className="px-4 py-3 font-semibold text-slate-300 border-b border-slate-700 whitespace-nowrap">최댓값</th>
                            <th className="px-4 py-3 font-semibold text-slate-300 border-b border-slate-700 whitespace-nowrap">평균</th>
                            <th className="px-4 py-3 font-semibold text-slate-300 border-b border-slate-700 whitespace-nowrap">합계</th>
                            <th className="px-4 py-3 font-semibold text-slate-300 border-b border-slate-700 whitespace-nowrap">표준편차</th>
                            <th className="px-4 py-3 font-semibold text-slate-300 border-b border-slate-700 whitespace-nowrap">고유값 수</th>
                        </tr>
                    </thead>
                    <tbody>
                        {displayStats.map((s, i) => (
                            <tr
                                key={s.column}
                                className={`border-b border-slate-800 transition-colors ${
                                    i % 2 === 0 ? "bg-slate-900/20" : "bg-slate-800/20"
                                } hover:bg-slate-800/50`}
                            >
                                <td className="px-4 py-2.5 font-medium text-slate-200 whitespace-nowrap sticky left-0 bg-inherit z-10">
                                    <span className="max-w-[160px] block truncate" title={s.column}>{s.column}</span>
                                </td>
                                <td className="px-4 py-2.5 text-slate-400 text-right tabular-nums">{s.total.toLocaleString()}</td>
                                <td className="px-4 py-2.5 text-right tabular-nums">
                                    <span className={s.nullCount > 0 ? "text-amber-400" : "text-slate-600"}>
                                        {s.nullCount.toLocaleString()}
                                    </span>
                                </td>
                                <td className="px-4 py-2.5 text-slate-300 text-right tabular-nums">{s.count.toLocaleString()}</td>
                                <td className="px-4 py-2.5">
                                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                                        s.isNumeric
                                            ? "bg-indigo-950/60 text-indigo-300 ring-1 ring-indigo-700/40"
                                            : "bg-slate-800 text-slate-400 ring-1 ring-slate-700"
                                    }`}>
                                        {s.isNumeric ? "숫자" : "텍스트"}
                                    </span>
                                </td>
                                <td className="px-4 py-2.5 text-slate-300 text-right tabular-nums">{fmt(s.min)}</td>
                                <td className="px-4 py-2.5 text-slate-300 text-right tabular-nums">{fmt(s.max)}</td>
                                <td className="px-4 py-2.5 text-slate-300 text-right tabular-nums">{fmt(s.mean)}</td>
                                <td className="px-4 py-2.5 text-slate-300 text-right tabular-nums">{fmt(s.sum)}</td>
                                <td className="px-4 py-2.5 text-slate-300 text-right tabular-nums">{fmt(s.stdDev)}</td>
                                <td className="px-4 py-2.5 text-slate-400 text-right tabular-nums">
                                    {s.isNumeric ? "—" : s.uniqueCount?.toLocaleString()}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            {!showAll && totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 flex-wrap">
                    <button
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                    >
                        <ChevronLeft className="w-4 h-4" />
                    </button>
                    <div className="flex gap-1">
                        {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
                            let pageNum: number;
                            if (totalPages <= 7) pageNum = i + 1;
                            else if (currentPage <= 4) pageNum = i + 1;
                            else if (currentPage >= totalPages - 3) pageNum = totalPages - 6 + i;
                            else pageNum = currentPage - 3 + i;
                            return (
                                <button
                                    key={pageNum}
                                    onClick={() => setCurrentPage(pageNum)}
                                    className={`px-3 py-1 rounded-lg text-sm font-medium transition-all ${
                                        currentPage === pageNum
                                            ? "bg-indigo-600 text-white"
                                            : "bg-slate-800 text-slate-400 hover:bg-slate-700"
                                    }`}
                                >
                                    {pageNum}
                                </button>
                            );
                        })}
                    </div>
                    <button
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                    >
                        <ChevronRight className="w-4 h-4" />
                    </button>
                    <span className="text-xs text-slate-500 ml-2">
                        {stats.length}개 컬럼 중 {(currentPage - 1) * COLS_PER_PAGE + 1}–
                        {Math.min(currentPage * COLS_PER_PAGE, stats.length)} 표시
                    </span>
                </div>
            )}
        </div>
    );
}

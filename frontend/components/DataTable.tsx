"use client";

import { useState, useCallback } from "react";
import { Plus, Trash2, RefreshCw, Download, ChevronLeft, ChevronRight, List } from "lucide-react";

const ROWS_PER_PAGE = 50;

type CellValue = string | number | null;

interface Props {
    headers: string[];
    rows: CellValue[][];
    onDataChange: (headers: string[], rows: CellValue[][]) => void;
    onGenerateChart: () => void;
    isChartLoading: boolean;
}

export default function DataTable({
    headers,
    rows,
    onDataChange,
    onGenerateChart,
    isChartLoading,
}: Props) {
    const [editingHeader, setEditingHeader] = useState<number | null>(null);
    const [showAll, setShowAll] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);

    const totalPages = Math.ceil(rows.length / ROWS_PER_PAGE);
    const displayRows = showAll
        ? rows
        : rows.slice((currentPage - 1) * ROWS_PER_PAGE, currentPage * ROWS_PER_PAGE);
    const rowOffset = showAll ? 0 : (currentPage - 1) * ROWS_PER_PAGE;

    // ── Cell editing ─────────────────────────────────────────────────
    const updateCell = useCallback(
        (rowIdx: number, colIdx: number, value: string) => {
            const updated = rows.map((row, ri) =>
                ri === rowIdx
                    ? row.map((cell, ci) => {
                        if (ci !== colIdx) return cell;
                        const num = Number(value);
                        return value === "" ? null : isNaN(num) ? value : num;
                    })
                    : row
            );
            onDataChange(headers, updated);
        },
        [rows, headers, onDataChange]
    );

    // ── Header editing ───────────────────────────────────────────────
    const updateHeader = useCallback(
        (colIdx: number, value: string) => {
            const updated = headers.map((h, i) => (i === colIdx ? value || h : h));
            onDataChange(updated, rows);
            setEditingHeader(null);
        },
        [headers, rows, onDataChange]
    );

    // ── Row management ───────────────────────────────────────────────
    const addRow = () => {
        onDataChange(headers, [...rows, Array(headers.length).fill(null)]);
    };

    const deleteRow = (rowIdx: number) => {
        onDataChange(headers, rows.filter((_, i) => i !== rowIdx));
    };

    // ── CSV export ───────────────────────────────────────────────────
    const downloadCSV = () => {
        const escape = (v: CellValue) =>
            `"${String(v ?? "").replace(/"/g, '""')}"`;
        const csv = [
            headers.map(escape).join(","),
            ...rows.map((r) => r.map(escape).join(",")),
        ].join("\n");
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
        a.download = "data.csv";
        a.click();
    };

    return (
        <div className="w-full flex flex-col gap-4">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <span className="text-slate-400 text-sm">
                        {rows.length} rows × {headers.length} columns
                    </span>
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
                <div className="flex gap-2">
                    <button
                        onClick={addRow}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 transition-colors"
                    >
                        <Plus className="w-4 h-4" /> Add Row
                    </button>
                    <button
                        onClick={downloadCSV}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 transition-colors"
                    >
                        <Download className="w-4 h-4" /> Export CSV
                    </button>
                    <button
                        onClick={onGenerateChart}
                        disabled={isChartLoading}
                        className="flex items-center gap-1.5 px-4 py-1.5 text-sm rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium transition-colors"
                    >
                        {isChartLoading ? (
                            <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                            <RefreshCw className="w-4 h-4" />
                        )}
                        Update Chart
                    </button>
                </div>
            </div>

            {/* Table */}
            <div className="w-full overflow-x-auto rounded-xl border border-slate-700 shadow-lg">
                <table className="w-full text-sm border-collapse">
                    <thead>
                        <tr className="bg-slate-900">
                            {headers.map((header, ci) => (
                                <th
                                    key={ci}
                                    className="px-4 py-3 text-left font-semibold text-slate-300 border-b border-slate-700 whitespace-nowrap"
                                >
                                    {editingHeader === ci ? (
                                        <input
                                            autoFocus
                                            defaultValue={header}
                                            onBlur={(e) => updateHeader(ci, e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter") updateHeader(ci, (e.target as HTMLInputElement).value);
                                                if (e.key === "Escape") setEditingHeader(null);
                                            }}
                                            className="bg-slate-800 rounded px-2 py-0.5 outline-none ring-1 ring-indigo-500 text-slate-100 w-full min-w-[80px]"
                                        />
                                    ) : (
                                        <span
                                            title="Double-click to edit header"
                                            onDoubleClick={() => setEditingHeader(ci)}
                                            className="cursor-pointer hover:text-indigo-400 transition-colors"
                                        >
                                            {header}
                                        </span>
                                    )}
                                </th>
                            ))}
                            <th className="px-3 py-3 border-b border-slate-700 w-10" />
                        </tr>
                    </thead>
                    <tbody>
                        {displayRows.map((row, ri) => {
                            const actualRi = ri + rowOffset;
                            return (
                            <tr
                                key={actualRi}
                                className="border-b border-slate-800 hover:bg-slate-800/50 transition-colors group"
                            >
                                {headers.map((_, ci) => {
                                    const val = ci < row.length ? row[ci] : null;
                                    return (
                                        <td key={ci} className="px-2 py-1">
                                            <input
                                                value={val ?? ""}
                                                onChange={(e) => updateCell(actualRi, ci, e.target.value)}
                                                className="w-full bg-transparent px-2 py-1 rounded text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:bg-slate-800 transition-all"
                                                placeholder="—"
                                            />
                                        </td>
                                    );
                                })}
                                <td className="px-2 py-1">
                                    <button
                                        onClick={() => deleteRow(actualRi)}
                                        className="p-1 rounded text-slate-600 hover:text-red-400 hover:bg-red-950/30 opacity-0 group-hover:opacity-100 transition-all"
                                        title="Delete row"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </td>
                            </tr>
                            );
                        })}
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
                    <div className="flex gap-1 flex-wrap justify-center">
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
                        Page {currentPage} / {totalPages} ({rows.length}행)
                    </span>
                </div>
            )}
        </div>
    );
}

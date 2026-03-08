"use client";

import { FileSpreadsheet, Info, ChevronDown, ChevronUp, TableProperties, Bot } from "lucide-react";
import FileUpload from "@/components/FileUpload";
import DataTable from "@/components/DataTable";
import DataChart from "@/components/DataChart";
import StatsTable from "@/components/StatsTable";
import AiAnalysisPanel from "@/components/AiAnalysisPanel";
import { useExcelData } from "@/hooks/useExcelData";

export default function Home() {
  const {
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
    sheetNames,
    activeSheet,
    handleUpload,
    handleSheetChange,
    handleDataChange,
    handleGenerateChart,
    handleReset,
    confidenceBadge,
  } = useExcelData();

  return (
    <main className="min-h-screen bg-[#0f1117] text-slate-100">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-indigo-600/20 ring-1 ring-indigo-500/30">
              <FileSpreadsheet className="w-6 h-6 text-indigo-400" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">Excel Parser</h1>
              <p className="text-xs text-slate-500">Upload → Edit → Visualize</p>
            </div>
          </div>
          {table && (
            <button
              onClick={handleReset}
              className="text-sm text-slate-400 hover:text-slate-200 transition-colors px-3 py-1.5 rounded-lg hover:bg-slate-800"
            >
              ← Upload another file
            </button>
          )}
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-10 flex flex-col gap-10">
        {/* Upload section */}
        {!table && (
          <section className="flex flex-col items-center gap-6">
            <div className="text-center max-w-xl">
              <h2 className="text-3xl font-bold bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent">
                Parse any Excel file
              </h2>
              <p className="text-slate-400 mt-2 text-sm leading-relaxed">
                Supports simple tables, merged header cells, multi-level headers, and complex layouts.
                Automatically falls back to AI parsing for ambiguous structures.
              </p>
            </div>
            <FileUpload
              onUpload={handleUpload}
              isLoading={isUploading}
              error={uploadError}
            />
          </section>
        )}

        {/* Parse result banner */}
        {table && confidenceBadge && (
          <div className={`flex flex-wrap items-center gap-3 px-4 py-3 rounded-xl border text-sm ${confidenceBadge.color}`}>
            <confidenceBadge.Icon className="w-4 h-4 shrink-0" />
            <span className="font-medium">{confidenceBadge.label}</span>
            <span className="text-slate-400">·</span>
            <span className="text-slate-400">
              Stage {table.stage} parser · confidence {(table.confidence * 100).toFixed(0)}%
            </span>
            {table.warnings.map((w, i) => (
              <span key={i} className="flex items-center gap-1 text-slate-400">
                <span>·</span> <Info className="w-3.5 h-3.5 shrink-0" /> {w}
              </span>
            ))}
          </div>
        )}

        {/* Sheet selector */}
        {table && sheetNames.length > 1 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-slate-500 shrink-0">시트:</span>
            {sheetNames.map((name) => (
              <button
                key={name}
                onClick={() => handleSheetChange(name)}
                disabled={isUploading}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all border ${
                  name === activeSheet
                    ? "bg-indigo-600 border-indigo-500 text-white shadow-sm shadow-indigo-900"
                    : "bg-slate-800 border-slate-700 text-slate-300 hover:border-indigo-500 hover:text-slate-100"
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {name}
              </button>
            ))}
          </div>
        )}

        {/* Editable table */}
        {table && !chart && (
          <section>
            <h2 className="text-lg font-semibold mb-4">
              Parsed Data
              <span className="ml-2 text-slate-500 text-sm font-normal">
                — double-click headers to rename, click cells to edit
              </span>
            </h2>
            <DataTable
              headers={headers}
              rows={rows}
              onDataChange={handleDataChange}
              onGenerateChart={handleGenerateChart}
              isChartLoading={isChartLoading}
            />
          </section>
        )}

        {/* Chart */}
        {chart && (
          <section>
            <h2 className="text-lg font-semibold mb-4">
              Chart
              <span className="ml-2 text-slate-500 text-sm font-normal">
                — toggle chart type using the buttons below
              </span>
            </h2>
            <DataChart
              chartData={chart}
              externalAxes={axisHint}
              onAxesChange={(xKey, yKeys) => setChartAxes({ xKey, yKeys })}
            />
          </section>
        )}

        {/* Statistics Table */}
        {table && (
          <section>
            <div className="flex items-center gap-3 mb-4">
              <TableProperties className="w-5 h-5 text-indigo-400" />
              <h2 className="text-lg font-semibold">통계 요약</h2>
              <span className="text-slate-500 text-sm font-normal">— 컬럼별 기초 통계량</span>
            </div>
            <StatsTable
              headers={headers}
              rows={rows}
              selectedKeys={[
                ...(chartAxes.xKey ? [chartAxes.xKey] : []),
                ...chartAxes.yKeys,
              ]}
            />
          </section>
        )}

        {/* AI Analysis Panel */}
        {table && (
          <section>
            <div className="flex items-center gap-3 mb-4">
              <Bot className="w-5 h-5 text-violet-400" />
              <h2 className="text-lg font-semibold">AI 분석</h2>
              <span className="text-slate-500 text-sm font-normal">— 로컬 LLM 기반 차트 추천 · 리포트 생성</span>
            </div>
            <AiAnalysisPanel
              headers={headers}
              rows={rows}
              onApplyAxes={setAxisHint}
              currentAxes={axisHint ?? undefined}
            />
          </section>
        )}

        {/* Raw Data — collapsible */}
        {table && (
          <section>
            <button
              onClick={() => setShowRawData(p => !p)}
              className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-slate-700 bg-slate-800/40 hover:bg-slate-800/70 transition-colors group"
            >
              <div className="flex items-center gap-3">
                <h2 className="text-base font-semibold text-slate-200">Raw 데이터</h2>
                <span className="text-slate-500 text-sm font-normal">
                  {rows.length}행 × {headers.length}열
                  {!showRawData && (
                    <span className="ml-2 text-slate-600">— 클릭하여 펼치기</span>
                  )}
                </span>
              </div>
              {showRawData
                ? <ChevronUp className="w-4 h-4 text-slate-400 group-hover:text-slate-200 transition-colors" />
                : <ChevronDown className="w-4 h-4 text-slate-400 group-hover:text-slate-200 transition-colors" />
              }
            </button>

            {showRawData && (
              <div className="mt-4">
                <DataTable
                  headers={headers}
                  rows={rows}
                  onDataChange={handleDataChange}
                  onGenerateChart={handleGenerateChart}
                  isChartLoading={isChartLoading}
                />
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}

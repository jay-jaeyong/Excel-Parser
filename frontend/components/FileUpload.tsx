"use client";

import { useCallback, useState } from "react";
import { Upload, FileSpreadsheet, AlertCircle, Loader2 } from "lucide-react";

interface Props {
    onUpload: (file: File) => void;
    isLoading: boolean;
    error: string | null;
}

export default function FileUpload({ onUpload, isLoading, error }: Props) {
    const [isDragOver, setIsDragOver] = useState(false);

    const handleFile = useCallback(
        (file: File) => {
            const ext = file.name.split(".").pop()?.toLowerCase();
            if (ext !== "xlsx" && ext !== "xls") {
                alert("Please upload an Excel file (.xlsx or .xls)");
                return;
            }
            onUpload(file);
        },
        [onUpload]
    );

    const onDrop = useCallback(
        (e: React.DragEvent) => {
            e.preventDefault();
            setIsDragOver(false);
            const file = e.dataTransfer.files[0];
            if (file) handleFile(file);
        },
        [handleFile]
    );

    const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) handleFile(file);
        e.target.value = "";
    };

    return (
        <div className="w-full flex flex-col items-center gap-4">
            <label
                htmlFor="excel-file-input"
                onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={onDrop}
                className={`
          relative w-full max-w-2xl rounded-2xl border-2 border-dashed p-14
          flex flex-col items-center gap-4 cursor-pointer transition-all duration-200
          ${isDragOver
                        ? "border-indigo-400 bg-indigo-950/40 scale-[1.01]"
                        : "border-slate-600 bg-slate-800/50 hover:border-indigo-500 hover:bg-slate-800"
                    }
        `}
            >
                <input
                    id="excel-file-input"
                    type="file"
                    accept=".xlsx,.xls"
                    className="sr-only"
                    onChange={onInputChange}
                    disabled={isLoading}
                />

                {isLoading ? (
                    <>
                        <Loader2 className="w-14 h-14 text-indigo-400 animate-spin" />
                        <p className="text-slate-300 font-medium">Parsing your Excel file…</p>
                    </>
                ) : (
                    <>
                        <div className="p-4 rounded-full bg-indigo-600/20 ring-1 ring-indigo-500/30">
                            {isDragOver
                                ? <FileSpreadsheet className="w-12 h-12 text-indigo-400" />
                                : <Upload className="w-12 h-12 text-indigo-400" />
                            }
                        </div>
                        <div className="text-center">
                            <p className="text-lg font-semibold text-slate-200">
                                Drop your Excel file here
                            </p>
                            <p className="text-slate-400 mt-1 text-sm">
                                or <span className="text-indigo-400 underline underline-offset-2">click to browse</span>
                            </p>
                            <p className="text-slate-500 text-xs mt-2">.xlsx and .xls supported</p>
                        </div>
                    </>
                )}
            </label>

            {error && (
                <div className="flex items-center gap-2 text-red-400 bg-red-950/40 border border-red-800 rounded-lg px-4 py-3 w-full max-w-2xl">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span className="text-sm">{error}</span>
                </div>
            )}
        </div>
    );
}

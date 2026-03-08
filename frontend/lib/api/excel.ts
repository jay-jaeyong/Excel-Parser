/**
 * Excel upload and chart-data API calls.
 */
import type { ParsedTable, ChartData } from "./types";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export async function uploadExcel(file: File, sheet?: string): Promise<ParsedTable> {
    const form = new FormData();
    form.append("file", file);
    if (sheet) form.append("sheet", sheet);

    const res = await fetch(`${BASE_URL}/api/upload`, {
        method: "POST",
        body: form,
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail ?? "Upload failed");
    }
    return res.json();
}

export async function getChartData(
    headers: string[],
    rows: (string | number | null)[][]
): Promise<ChartData> {
    const res = await fetch(`${BASE_URL}/api/chart-data`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ headers, rows }),
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail ?? "Chart data fetch failed");
    }
    return res.json();
}

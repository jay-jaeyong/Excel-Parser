/**
 * Shared primitive and domain types used across the whole frontend.
 */

export type CellValue = string | number | null;

export interface AxisSuggestion {
    xKey: string | null;
    yKeys: string[];
    chartType: string;
}

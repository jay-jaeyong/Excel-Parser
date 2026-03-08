/**
 * All API request/response interfaces.
 */

export interface ParsedTable {
    headers: string[];
    rows: (string | number | null)[][];
    confidence: number;
    stage: number;
    warnings: string[];
    sheet_names: string[];
    active_sheet: string;
}

export interface ChartData {
    labelKey: string | null;
    data: Record<string, string | number | null>[];
    numericKeys: string[];
    suggestedType: "bar" | "line" | "pie";
}

export interface AnalyzeResult {
    can_graph: boolean;
    reason: string;
    x_key: string | null;
    y_keys: string[];
    chart_type: string;
}

export interface ChatMessage {
    role: "user" | "assistant";
    content: string;
}

export interface ReportRequest {
    headers: string[];
    rows: (string | number | null)[][];
    x_key: string | null;
    y_keys: string[];
    chart_type: string;
    question: string;
    history: ChatMessage[];
    current_html?: string;
    /** false → 테이블 컨텍스트 생략 (차트 스타일 변경 등 데이터가 필요 없는 요청) */
    inject_data?: boolean;
}

export interface ChartCustomOptions {
    title?: string;
    colors?: string[];
    y_min?: number;
    y_max?: number;
    bg_color?: string;
    show_legend?: boolean;
    x_label?: string;
    y_label?: string;
    grid_color?: string;
}

export interface ChartHtmlRequest {
    headers: string[];
    rows: (string | number | null)[][];
    x_key: string | null;
    y_keys: string[];
    chart_type: string;
    custom_options?: ChartCustomOptions;
}

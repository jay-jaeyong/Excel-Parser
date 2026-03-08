"""
Chart data service — converts parsed table to Recharts-compatible format.
"""
from typing import Any


def _is_numeric_column(values: list[Any]) -> bool:
    """Return True if the majority of non-None values are numeric."""
    nums = [v for v in values if isinstance(v, (int, float))]
    total = [v for v in values if v is not None]
    if not total:
        return False
    return len(nums) / len(total) >= 0.6


def build_chart_data(headers: list[str], rows: list[list[Any]]) -> dict:
    """
    Return Recharts-compatible chart payload:
    {
        "labelKey": "<header used as X-axis>",
        "data": [{"Month": "Jan", "Sales": 100, ...}, ...],
        "numericKeys": ["Sales", "Revenue", ...],
        "suggestedType": "bar" | "line" | "pie"
    }
    """
    if not headers or not rows:
        return {"labelKey": None, "data": [], "numericKeys": [], "suggestedType": "bar"}

    ncols = len(headers)

    # Build per-column value lists
    col_values: list[list[Any]] = [[] for _ in range(ncols)]
    for row in rows:
        for c in range(ncols):
            col_values[c].append(row[c] if c < len(row) else None)

    # Identify numeric columns
    numeric_flags = [_is_numeric_column(col_values[c]) for c in range(ncols)]

    # Label key = first non-numeric column, else first column
    label_idx = next((i for i, n in enumerate(numeric_flags) if not n), 0)
    label_key = headers[label_idx]

    numeric_keys = [headers[i] for i, n in enumerate(numeric_flags) if n]

    # Build data list for Recharts
    data = []
    for row in rows:
        record: dict[str, Any] = {}
        for c in range(ncols):
            val = row[c] if c < len(row) else None
            # Recharts needs actual numbers — coerce strings that look numeric
            if numeric_flags[c] and val is not None:
                try:
                    val = float(val)
                    if val == int(val):
                        val = int(val)
                except (ValueError, TypeError):
                    pass
            record[headers[c]] = val
        data.append(record)

    # Suggest chart type based on structure
    suggested = "bar"
    if len(numeric_keys) == 1 and len(rows) > 6:
        suggested = "line"
    if len(numeric_keys) == 1 and len(rows) <= 6:
        suggested = "pie"

    return {
        "labelKey": label_key,
        "data": data,
        "numericKeys": numeric_keys,
        "suggestedType": suggested,
    }

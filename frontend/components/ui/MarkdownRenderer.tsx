import React from "react";

/**
 * Renders a simple Markdown-like string into React nodes.
 * Supports headings (#, ##, ###), bullet/numbered lists,
 * bold (**text**), inline code (`code`), and horizontal rules.
 */
export default function MarkdownRenderer({ text }: { text: string }) {
    const lines = text.split("\n");
    const nodes: React.ReactNode[] = [];
    let key = 0;

    const inlineFormat = (s: string): React.ReactNode => {
        const parts = s.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
        return parts.map((p, i) => {
            if (p.startsWith("**") && p.endsWith("**"))
                return (
                    <strong key={i} className="text-slate-100 font-semibold">
                        {p.slice(2, -2)}
                    </strong>
                );
            if (p.startsWith("`") && p.endsWith("`"))
                return (
                    <code key={i} className="bg-slate-700 text-indigo-300 px-1 rounded text-xs font-mono">
                        {p.slice(1, -1)}
                    </code>
                );
            return p;
        });
    };

    let i = 0;
    while (i < lines.length) {
        const line = lines[i];

        if (line.startsWith("### ")) {
            nodes.push(
                <h4 key={key++} className="text-sm font-bold text-indigo-300 mt-3 mb-1">
                    {line.slice(4)}
                </h4>,
            );
        } else if (line.startsWith("## ")) {
            nodes.push(
                <h3 key={key++} className="text-base font-bold text-indigo-300 mt-4 mb-1">
                    {line.slice(3)}
                </h3>,
            );
        } else if (line.startsWith("# ")) {
            nodes.push(
                <h2 key={key++} className="text-lg font-bold text-indigo-200 mt-4 mb-2">
                    {line.slice(2)}
                </h2>,
            );
        } else if (line.startsWith("- ") || line.startsWith("* ")) {
            nodes.push(
                <li key={key++} className="flex gap-2 text-sm text-slate-300 leading-relaxed ml-2">
                    <span className="text-indigo-400 mt-1 shrink-0">·</span>
                    <span>{inlineFormat(line.slice(2))}</span>
                </li>,
            );
        } else if (/^\d+\. /.test(line)) {
            const num = line.match(/^(\d+)\. /)?.[1];
            nodes.push(
                <li key={key++} className="flex gap-2 text-sm text-slate-300 leading-relaxed ml-2">
                    <span className="text-indigo-400 shrink-0 font-mono">{num}.</span>
                    <span>{inlineFormat(line.replace(/^\d+\. /, ""))}</span>
                </li>,
            );
        } else if (line.startsWith("---") || line.startsWith("===")) {
            nodes.push(<hr key={key++} className="border-slate-700 my-3" />);
        } else if (line.trim() === "") {
            nodes.push(<div key={key++} className="h-1.5" />);
        } else {
            nodes.push(
                <p key={key++} className="text-sm text-slate-300 leading-relaxed">
                    {inlineFormat(line)}
                </p>,
            );
        }
        i++;
    }

    return <>{nodes}</>;
}

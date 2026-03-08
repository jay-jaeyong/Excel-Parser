"use client";

import { Bot, Send, StopCircle } from "lucide-react";
import type { ChatMessage } from "@/lib/api";
import MarkdownRenderer from "@/components/ui/MarkdownRenderer";

interface Props {
    history: ChatMessage[];
    streamingText: string;
    reportError: string | null;
    isStreaming: boolean;
    input: string;
    setInput: (v: string) => void;
    onSend: () => void;
    onStop: () => void;
    onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
    quickPrompts: string[];
    hasData: boolean;
    chatContainerRef: React.RefObject<HTMLDivElement | null>;
    chatBottomRef: React.RefObject<HTMLDivElement | null>;
    inputRef: React.RefObject<HTMLTextAreaElement | null>;
}

/**
 * Right panel of the AI Analysis Panel — chat message list + input area.
 */
export default function ChatPanel({
    history,
    streamingText,
    reportError,
    isStreaming,
    input,
    setInput,
    onSend,
    onStop,
    onKeyDown,
    quickPrompts,
    hasData,
    chatContainerRef,
    chatBottomRef,
    inputRef,
}: Props) {
    return (
        <div className="flex-1 flex flex-col min-w-0">

            {/* 채팅 메시지 영역 */}
            <div
                ref={chatContainerRef}
                className="flex-1 flex flex-col gap-0 overflow-y-auto px-4 py-4"
                style={{ maxHeight: 580 }}
            >
                {/* 빈 상태 안내 */}
                {history.length === 0 && !streamingText && (
                    <div className="flex flex-col items-center justify-center h-full gap-4 py-6 text-center">
                        <div className="p-3 rounded-2xl bg-violet-950/30 ring-1 ring-violet-800/30">
                            <Bot className="w-7 h-7 text-violet-400" />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-slate-300 mb-1">채팅으로 차트를 제어하세요</p>
                            <p className="text-xs text-slate-600 leading-relaxed">
                                데이터 분석뿐 아니라 차트 종류·색상·제목·축 등을<br />자연어로 변경할 수 있습니다
                            </p>
                        </div>
                        <div className="flex flex-col gap-1.5 w-full max-w-xs text-xs text-slate-600">
                            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/50 border border-slate-700/50">
                                <span className="text-violet-500">→</span> "라인 차트로 바꿔줘"
                            </div>
                            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/50 border border-slate-700/50">
                                <span className="text-violet-500">→</span> "막대 색상을 파란색으로"
                            </div>
                            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/50 border border-slate-700/50">
                                <span className="text-violet-500">→</span> "이 데이터의 주요 인사이트 요약"
                            </div>
                        </div>
                    </div>
                )}

                {/* 메시지 목록 */}
                {history.map((msg, i) => (
                    <div
                        key={i}
                        className={`mb-4 ${msg.role === "user" ? "flex justify-end" : "flex justify-start"}`}
                    >
                        {msg.role === "assistant" && (
                            <div className="flex items-start gap-2 max-w-[90%]">
                                <div className="shrink-0 w-6 h-6 rounded-full bg-violet-600/30 ring-1 ring-violet-500/40 flex items-center justify-center mt-0.5">
                                    <Bot className="w-3.5 h-3.5 text-violet-400" />
                                </div>
                                <div className="flex flex-col gap-0.5 bg-slate-800/60 rounded-2xl rounded-tl-sm px-4 py-3 border border-slate-700/60">
                                    <MarkdownRenderer text={msg.content} />
                                </div>
                            </div>
                        )}
                        {msg.role === "user" && (
                            <div className="max-w-[80%] bg-indigo-600/20 border border-indigo-500/30 rounded-2xl rounded-tr-sm px-4 py-2.5">
                                <p className="text-sm text-indigo-100">{msg.content}</p>
                            </div>
                        )}
                    </div>
                ))}

                {/* 스트리밍 시작 전 — 생각 중 말풍선 */}
                {isStreaming && !streamingText && (
                    <div className="flex items-start gap-2 mb-4 max-w-[90%]">
                        <div className="shrink-0 w-6 h-6 rounded-full bg-violet-600/30 ring-1 ring-violet-500/40 flex items-center justify-center mt-0.5">
                            <Bot className="w-3.5 h-3.5 text-violet-400 animate-pulse" />
                        </div>
                        <div className="flex items-center gap-1.5 bg-slate-800/60 rounded-2xl rounded-tl-sm px-4 py-3 border border-violet-700/40">
                            <span className="w-2 h-2 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                            <span className="w-2 h-2 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                            <span className="w-2 h-2 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                    </div>
                )}

                {/* 스트리밍 중인 메시지 */}
                {streamingText && (
                    <div className="flex items-start gap-2 mb-4 max-w-[90%]">
                        <div className="shrink-0 w-6 h-6 rounded-full bg-violet-600/30 ring-1 ring-violet-500/40 flex items-center justify-center mt-0.5">
                            <Bot className="w-3.5 h-3.5 text-violet-400 animate-pulse" />
                        </div>
                        <div className="flex flex-col gap-0.5 bg-slate-800/60 rounded-2xl rounded-tl-sm px-4 py-3 border border-violet-700/40">
                            <MarkdownRenderer text={streamingText} />
                            <span className="inline-block w-1.5 h-4 bg-indigo-400 animate-pulse rounded-sm mt-1" />
                        </div>
                    </div>
                )}

                {/* 에러 */}
                {reportError && (
                    <div className="flex items-center gap-2 text-sm text-red-400 bg-red-950/30 border border-red-800/40 rounded-xl px-4 py-3 mb-4">
                        <span className="w-4 h-4 shrink-0">✕</span>
                        {reportError}
                    </div>
                )}

                <div ref={chatBottomRef} />
            </div>

            {/* 빠른 질문 */}
            {!isStreaming && history.length === 0 && hasData && (
                <div className="px-4 pb-3 flex flex-wrap gap-1.5 border-t border-slate-700/40 pt-3">
                    {quickPrompts.map(prompt => (
                        <button
                            key={prompt}
                            onClick={() => {
                                setInput(prompt);
                                inputRef.current?.focus();
                            }}
                            className="text-xs px-2.5 py-1.5 rounded-full border border-slate-700 bg-slate-800 text-slate-400 hover:text-slate-200 hover:border-violet-500/50 transition-colors"
                        >
                            {prompt}
                        </button>
                    ))}
                </div>
            )}

            {/* AI 작동 중 상태바 */}
            {isStreaming && (
                <div className="mx-4 mb-2 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-violet-950/50 border border-violet-700/40 text-xs text-violet-300">
                    <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-violet-500" />
                    </span>
                    AI 응답 생성 중…
                </div>
            )}

            {/* 입력창 */}
            <div className="px-4 pb-4 pt-3 border-t border-slate-700/60 flex gap-2 items-end">
                <textarea
                    ref={inputRef}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={onKeyDown}
                    disabled={!hasData || isStreaming}
                    placeholder={
                        !hasData
                            ? "Excel 파일을 먼저 업로드하세요"
                            : isStreaming
                                ? "AI가 응답 중입니다..."
                                : "질문이나 차트 변경 (예: '라인 차트로', '파란색으로') — Enter: 전송"
                    }
                    rows={2}
                    className={`flex-1 bg-slate-800 text-slate-200 border rounded-xl px-3.5 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-violet-500 placeholder-slate-600 disabled:opacity-50 transition-colors ${isStreaming ? 'border-violet-700/50 opacity-50' : 'border-slate-700'}`}
                />
                {isStreaming ? (
                    <button
                        onClick={onStop}
                        className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-red-700 hover:bg-red-600 text-white text-sm font-medium transition-all shrink-0"
                    >
                        <StopCircle className="w-4 h-4" />
                        중단
                    </button>
                ) : (
                    <button
                        onClick={onSend}
                        disabled={!input.trim() || !hasData}
                        className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-all shrink-0"
                    >
                        <Send className="w-4 h-4" />
                        전송
                    </button>
                )}
            </div>
        </div>
    );
}

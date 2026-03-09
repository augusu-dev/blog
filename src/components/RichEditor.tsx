"use client";

import { useRef, useCallback, useEffect } from "react";
import { createProductUpdateMarkerHtml, linkifyPastedText } from "@/lib/postContent";

interface RichEditorProps {
    value: string;
    onChange: (html: string) => void;
    placeholder?: string;
    aiGenerated?: boolean;
    onAiGeneratedChange?: (checked: boolean) => void;
    showProductUpdateMarkerButton?: boolean;
}

export default function RichEditor({
    value,
    onChange,
    placeholder,
    aiGenerated = false,
    onAiGeneratedChange,
    showProductUpdateMarkerButton = false,
}: RichEditorProps) {
    const editorRef = useRef<HTMLDivElement>(null);
    const isInitialized = useRef(false);

    // Initialize content only once
    useEffect(() => {
        if (editorRef.current && !isInitialized.current) {
            editorRef.current.innerHTML = value || "";
            isInitialized.current = true;
        }
    }, [value]);

    // Update content when value changes externally (e.g. loading a post for editing)
    useEffect(() => {
        if (editorRef.current && isInitialized.current) {
            const currentHtml = editorRef.current.innerHTML;
            if (value !== currentHtml && value !== undefined) {
                // Only update if it's a completely different value (not from user typing)
                if (value === "" || (value.length > 0 && currentHtml.length === 0)) {
                    editorRef.current.innerHTML = value;
                }
            }
        }
    }, [value]);

    const exec = useCallback((command: string, val?: string) => {
        editorRef.current?.focus();
        document.execCommand(command, false, val);
        requestAnimationFrame(() => {
            if (editorRef.current) {
                onChange(editorRef.current.innerHTML);
            }
        });
    }, [onChange]);

    const handleInput = useCallback(() => {
        if (editorRef.current) {
            onChange(editorRef.current.innerHTML);
        }
    }, [onChange]);

    const handlePaste = useCallback((e: React.ClipboardEvent) => {
        e.preventDefault();
        const text = e.clipboardData.getData("text/plain");
        document.execCommand("insertHTML", false, linkifyPastedText(text));
        requestAnimationFrame(() => {
            if (editorRef.current) {
                onChange(editorRef.current.innerHTML);
            }
        });
    }, [onChange]);

    const insertProductUpdateMarker = useCallback(() => {
        editorRef.current?.focus();
        document.execCommand(
            "insertHTML",
            false,
            createProductUpdateMarkerHtml(new Date(), { withSpacer: true })
        );
        requestAnimationFrame(() => {
            if (editorRef.current) {
                onChange(editorRef.current.innerHTML);
            }
        });
    }, [onChange]);

    type ToolItem = { cmd: string; label: React.ReactNode; title: string; val?: string; prompt?: boolean };
    const tools: { group: string; items: ToolItem[] }[] = [
        {
            group: "format", items: [
                { cmd: "bold", label: <strong>B</strong>, title: "太字" },
                { cmd: "italic", label: <em>I</em>, title: "斜体" },
                { cmd: "underline", label: <u>U</u>, title: "下線" },
            ]
        },
        {
            group: "heading", items: [
                { cmd: "formatBlock", val: "h2", label: "H2", title: "見出し" },
                { cmd: "formatBlock", val: "h3", label: "H3", title: "小見出し" },
                { cmd: "formatBlock", val: "p", label: "P", title: "本文" },
            ]
        },
        {
            group: "list", items: [
                { cmd: "insertUnorderedList", label: "•", title: "箇条書き" },
                { cmd: "insertOrderedList", label: "1.", title: "番号リスト" },
                { cmd: "formatBlock", val: "blockquote", label: "❝", title: "引用" },
            ]
        },
    ];

    return (
        <div className="rich-editor-wrapper">
            <div className="rich-toolbar" style={{ justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                {tools.map((group, gi) => (
                    <div key={gi} style={{ display: "flex", gap: 2, alignItems: "center" }}>
                        {gi > 0 && <div className="rich-toolbar-divider" />}
                        {group.items.map((tool, ti) => (
                            <button
                                key={ti}
                                type="button"
                                className="rich-tool-btn"
                                title={tool.title}
                                onMouseDown={(e) => {
                                    e.preventDefault();
                                    exec(tool.cmd, tool.val);
                                }}
                            >
                                {tool.label}
                            </button>
                        ))}
                    </div>
                ))}
                {showProductUpdateMarkerButton ? (
                    <>
                        <div className="rich-toolbar-divider" />
                        <button
                            type="button"
                            className="rich-tool-btn rich-tool-btn-wide"
                            title="更新区切りを追加"
                            onMouseDown={(e) => {
                                e.preventDefault();
                                insertProductUpdateMarker();
                            }}
                        >
                            更新線
                        </button>
                    </>
                ) : null}
                </div>
                {onAiGeneratedChange && (
                    <label
                        style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 5,
                            fontSize: 11,
                            color: "var(--text-soft)",
                            userSelect: "none",
                            marginLeft: 8,
                        }}
                    >
                        <input
                            type="checkbox"
                            checked={aiGenerated}
                            onChange={(e) => onAiGeneratedChange(e.target.checked)}
                            style={{ margin: 0 }}
                        />
                        AIで作成
                    </label>
                )}
            </div>
            <div
                ref={editorRef}
                className="rich-editor-content md-content"
                contentEditable
                onInput={handleInput}
                onPaste={handlePaste}
                data-placeholder={placeholder || "ここに記事を書きましょう..."}
                suppressContentEditableWarning
            />
        </div>
    );
}

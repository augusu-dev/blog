"use client";

import { useRef, useCallback } from "react";

interface RichEditorProps {
    value: string;
    onChange: (html: string) => void;
    placeholder?: string;
}

export default function RichEditor({ value, onChange, placeholder }: RichEditorProps) {
    const editorRef = useRef<HTMLDivElement>(null);

    const exec = useCallback((command: string, value?: string) => {
        document.execCommand(command, false, value);
        if (editorRef.current) {
            onChange(editorRef.current.innerHTML);
        }
        editorRef.current?.focus();
    }, [onChange]);

    const handleInput = useCallback(() => {
        if (editorRef.current) {
            onChange(editorRef.current.innerHTML);
        }
    }, [onChange]);

    const handlePaste = useCallback((e: React.ClipboardEvent) => {
        e.preventDefault();
        const text = e.clipboardData.getData("text/plain");
        document.execCommand("insertText", false, text);
    }, []);

    return (
        <div className="rich-editor-wrapper">
            {/* Toolbar */}
            <div className="rich-toolbar">
                <div className="rich-toolbar-group">
                    <button type="button" className="rich-tool-btn" onClick={() => exec("bold")} title="太字">
                        <strong>B</strong>
                    </button>
                    <button type="button" className="rich-tool-btn" onClick={() => exec("italic")} title="斜体">
                        <em>I</em>
                    </button>
                    <button type="button" className="rich-tool-btn" onClick={() => exec("underline")} title="下線">
                        <u>U</u>
                    </button>
                    <button type="button" className="rich-tool-btn" onClick={() => exec("strikeThrough")} title="取り消し線">
                        <s>S</s>
                    </button>
                </div>

                <div className="rich-toolbar-divider" />

                <div className="rich-toolbar-group">
                    <button type="button" className="rich-tool-btn" onClick={() => exec("formatBlock", "h1")} title="大見出し">
                        H1
                    </button>
                    <button type="button" className="rich-tool-btn" onClick={() => exec("formatBlock", "h2")} title="中見出し">
                        H2
                    </button>
                    <button type="button" className="rich-tool-btn" onClick={() => exec("formatBlock", "h3")} title="小見出し">
                        H3
                    </button>
                    <button type="button" className="rich-tool-btn" onClick={() => exec("formatBlock", "p")} title="本文">
                        P
                    </button>
                </div>

                <div className="rich-toolbar-divider" />

                <div className="rich-toolbar-group">
                    <button type="button" className="rich-tool-btn" onClick={() => exec("insertUnorderedList")} title="箇条書き">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><circle cx="4" cy="6" r="1" fill="currentColor" /><circle cx="4" cy="12" r="1" fill="currentColor" /><circle cx="4" cy="18" r="1" fill="currentColor" /></svg>
                    </button>
                    <button type="button" className="rich-tool-btn" onClick={() => exec("insertOrderedList")} title="番号付きリスト">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="10" y1="6" x2="21" y2="6" /><line x1="10" y1="12" x2="21" y2="12" /><line x1="10" y1="18" x2="21" y2="18" /><text x="2" y="8" fontSize="8" fill="currentColor" stroke="none">1</text><text x="2" y="14" fontSize="8" fill="currentColor" stroke="none">2</text><text x="2" y="20" fontSize="8" fill="currentColor" stroke="none">3</text></svg>
                    </button>
                    <button type="button" className="rich-tool-btn" onClick={() => exec("formatBlock", "blockquote")} title="引用">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V21z" /><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3z" /></svg>
                    </button>
                </div>

                <div className="rich-toolbar-divider" />

                <div className="rich-toolbar-group">
                    <button
                        type="button"
                        className="rich-tool-btn"
                        onClick={() => {
                            const url = prompt("リンクのURLを入力してください:");
                            if (url) exec("createLink", url);
                        }}
                        title="リンク"
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
                    </button>
                    <button type="button" className="rich-tool-btn" onClick={() => exec("removeFormat")} title="書式をクリア">
                        ✕
                    </button>
                </div>
            </div>

            {/* Editor area */}
            <div
                ref={editorRef}
                className="rich-editor-content md-content"
                contentEditable
                onInput={handleInput}
                onPaste={handlePaste}
                dangerouslySetInnerHTML={value ? { __html: value } : undefined}
                data-placeholder={placeholder || "ここに記事を書きましょう..."}
                suppressContentEditableWarning
            />
        </div>
    );
}

"use client";

import { useState, useRef, useCallback } from "react";

interface TagInputProps {
    tags: string[];
    onChange: (tags: string[]) => void;
    placeholder?: string;
}

const SUGGESTED_TAGS = ["AI", "思考", "コード", "3D", "哲学", "テクノロジー", "社会", "作品", "ツール", "デザイン", "言語"];

export default function TagInput({ tags, onChange, placeholder }: TagInputProps) {
    const [input, setInput] = useState("");
    const [showSuggestions, setShowSuggestions] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const addTag = useCallback((tag: string) => {
        const trimmed = tag.trim();
        if (trimmed && !tags.includes(trimmed)) {
            onChange([...tags, trimmed]);
        }
        setInput("");
        setShowSuggestions(false);
        inputRef.current?.focus();
    }, [tags, onChange]);

    const removeTag = useCallback((index: number) => {
        onChange(tags.filter((_, i) => i !== index));
    }, [tags, onChange]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" || e.key === "," || e.key === "、") {
            e.preventDefault();
            if (input.trim()) addTag(input);
        }
        if (e.key === "Backspace" && !input && tags.length > 0) {
            removeTag(tags.length - 1);
        }
    };

    const filteredSuggestions = SUGGESTED_TAGS.filter(
        (s) => !tags.includes(s) && (input === "" || s.toLowerCase().includes(input.toLowerCase()))
    );

    return (
        <div className="tag-input-wrapper">
            <div className="tag-input-container" onClick={() => inputRef.current?.focus()}>
                {tags.map((tag, i) => (
                    <span key={i} className="tag-chip">
                        {tag}
                        <button type="button" className="tag-chip-remove" onClick={() => removeTag(i)}>×</button>
                    </span>
                ))}
                <input
                    ref={inputRef}
                    type="text"
                    className="tag-input-field"
                    value={input}
                    onChange={(e) => { setInput(e.target.value); setShowSuggestions(true); }}
                    onKeyDown={handleKeyDown}
                    onFocus={() => setShowSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                    placeholder={tags.length === 0 ? (placeholder || "タグを入力（Enterで追加）") : ""}
                />
            </div>
            {showSuggestions && filteredSuggestions.length > 0 && (
                <div className="tag-suggestions">
                    {filteredSuggestions.slice(0, 6).map((s) => (
                        <button key={s} type="button" className="tag-suggestion-btn" onMouseDown={() => addTag(s)}>
                            {s}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

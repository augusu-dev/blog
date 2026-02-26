"use client";

import { Suspense } from "react";
import EditorPage from "./EditorContent";

export default function EditorPageWrapper() {
    return (
        <Suspense
            fallback={
                <div className="login-container">
                    <div className="login-card" style={{ textAlign: "center" }}>
                        <p style={{ color: "var(--text-soft)" }}>読み込み中...</p>
                    </div>
                </div>
            }
        >
            <EditorPage />
        </Suspense>
    );
}

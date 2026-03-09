"use client";

type CacheEnvelope<T> = {
    savedAt: number;
    value: T;
};

export function readSessionCache<T>(key: string, ttlMs: number): T | null {
    if (typeof window === "undefined") {
        return null;
    }

    try {
        const raw = sessionStorage.getItem(key);
        if (!raw) {
            return null;
        }

        const parsed = JSON.parse(raw) as CacheEnvelope<T>;
        if (
            !parsed ||
            typeof parsed !== "object" ||
            typeof parsed.savedAt !== "number" ||
            Date.now() - parsed.savedAt > ttlMs
        ) {
            sessionStorage.removeItem(key);
            return null;
        }

        return parsed.value ?? null;
    } catch {
        return null;
    }
}

export function writeSessionCache<T>(key: string, value: T): void {
    if (typeof window === "undefined") {
        return;
    }

    try {
        const payload: CacheEnvelope<T> = {
            savedAt: Date.now(),
            value,
        };
        sessionStorage.setItem(key, JSON.stringify(payload));
    } catch {
        // Ignore storage failures.
    }
}

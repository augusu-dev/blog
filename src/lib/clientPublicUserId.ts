"use client";

const PUBLIC_USER_ID_STORAGE_PREFIX = "public-user-id";

function normalizeValue(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

function buildStorageKey(primaryUserId: string): string {
    return `${PUBLIC_USER_ID_STORAGE_PREFIX}:${primaryUserId}`;
}

export function readCachedPublicUserId(primaryUserId?: string | null): string {
    if (typeof window === "undefined") return "";

    const normalizedPrimaryUserId = normalizeValue(primaryUserId);
    if (!normalizedPrimaryUserId) return "";

    try {
        return normalizeValue(localStorage.getItem(buildStorageKey(normalizedPrimaryUserId)));
    } catch {
        return "";
    }
}

export function resolveClientPublicUserId(
    primaryUserId?: string | null,
    fallbackPublicUserId?: string | null
): string {
    return readCachedPublicUserId(primaryUserId) || normalizeValue(fallbackPublicUserId);
}

export function writeCachedPublicUserId(
    primaryUserId?: string | null,
    publicUserId?: string | null
): void {
    if (typeof window === "undefined") return;

    const normalizedPrimaryUserId = normalizeValue(primaryUserId);
    if (!normalizedPrimaryUserId) return;

    const normalizedPublicUserId = normalizeValue(publicUserId);

    try {
        if (!normalizedPublicUserId) {
            localStorage.removeItem(buildStorageKey(normalizedPrimaryUserId));
            return;
        }

        localStorage.setItem(buildStorageKey(normalizedPrimaryUserId), normalizedPublicUserId);
    } catch {
        // Ignore storage failures.
    }
}

const POST_RETURN_STORAGE_PREFIX = "post-return-path:";
const SCROLL_RESTORE_STORAGE_PREFIX = "scroll-restore:";

function buildStorageKey(postPath: string): string {
    return `${POST_RETURN_STORAGE_PREFIX}${postPath}`;
}

function buildScrollRestoreKey(path: string): string {
    return `${SCROLL_RESTORE_STORAGE_PREFIX}${path}`;
}

function normalizeAppPath(path: string): string {
    if (!path) return "/";
    return path.startsWith("/") ? path : `/${path}`;
}

export function buildUserProfilePath(userRef: string): string {
    return `/user/${encodeURIComponent(userRef)}`;
}

export function buildUserPostPath(userRef: string, postId: string): string {
    return `${buildUserProfilePath(userRef)}/posts/${encodeURIComponent(postId)}`;
}

export function rememberPostReturnPath(postPath: string, returnPath: string): void {
    if (typeof window === "undefined") return;

    const normalizedPostPath = normalizeAppPath(postPath);
    const normalizedReturnPath = normalizeAppPath(returnPath);

    if (!normalizedPostPath || !normalizedReturnPath || normalizedPostPath === normalizedReturnPath) {
        return;
    }

    try {
        sessionStorage.setItem(
            buildStorageKey(normalizedPostPath),
            JSON.stringify({
                path: normalizedReturnPath,
                scrollY: window.scrollY,
            })
        );
    } catch {
        // Ignore storage failures.
    }
}

export function consumePostReturnPath(postPath: string): { path: string; scrollY: number } | null {
    if (typeof window === "undefined") return null;

    const normalizedPostPath = normalizeAppPath(postPath);

    try {
        const key = buildStorageKey(normalizedPostPath);
        const stored = sessionStorage.getItem(key);
        sessionStorage.removeItem(key);
        if (!stored) {
            return null;
        }

        const parsed = JSON.parse(stored) as { path?: unknown; scrollY?: unknown };
        const path = typeof parsed.path === "string" ? normalizeAppPath(parsed.path) : null;
        const scrollY = typeof parsed.scrollY === "number" && Number.isFinite(parsed.scrollY) ? parsed.scrollY : 0;

        return path ? { path, scrollY: Math.max(0, scrollY) } : null;
    } catch {
        return null;
    }
}

export function queueScrollRestore(path: string, scrollY: number): void {
    if (typeof window === "undefined") return;

    try {
        sessionStorage.setItem(
            buildScrollRestoreKey(normalizeAppPath(path)),
            JSON.stringify({ scrollY: Math.max(0, scrollY) })
        );
    } catch {
        // Ignore storage failures.
    }
}

export function consumeQueuedScrollRestore(path: string): number | null {
    if (typeof window === "undefined") return null;

    try {
        const key = buildScrollRestoreKey(normalizeAppPath(path));
        const stored = sessionStorage.getItem(key);
        sessionStorage.removeItem(key);
        if (!stored) {
            return null;
        }

        const parsed = JSON.parse(stored) as { scrollY?: unknown };
        const scrollY = typeof parsed.scrollY === "number" && Number.isFinite(parsed.scrollY) ? parsed.scrollY : null;
        return scrollY === null ? null : Math.max(0, scrollY);
    } catch {
        return null;
    }
}

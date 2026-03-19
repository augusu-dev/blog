const POST_RETURN_STORAGE_PREFIX = "post-return-path:";

function buildStorageKey(postPath: string): string {
    return `${POST_RETURN_STORAGE_PREFIX}${postPath}`;
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
        sessionStorage.setItem(buildStorageKey(normalizedPostPath), normalizedReturnPath);
    } catch {
        // Ignore storage failures.
    }
}

export function consumePostReturnPath(postPath: string): string | null {
    if (typeof window === "undefined") return null;

    const normalizedPostPath = normalizeAppPath(postPath);

    try {
        const key = buildStorageKey(normalizedPostPath);
        const stored = sessionStorage.getItem(key);
        sessionStorage.removeItem(key);
        return stored ? normalizeAppPath(stored) : null;
    } catch {
        return null;
    }
}

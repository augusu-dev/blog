const LAST_SEEN_KEY = "dm-pr-last-seen-at";
const REFRESH_EVENT = "dm-pr-unread-refresh";

function isBrowser(): boolean {
    return typeof window !== "undefined";
}

function buildLastSeenKey(userKey?: string | null): string {
    const normalizedUserKey = typeof userKey === "string" ? userKey.trim() : "";
    return normalizedUserKey ? `${LAST_SEEN_KEY}:${normalizedUserKey}` : LAST_SEEN_KEY;
}

export function getDmUnreadSince(userKey?: string | null): string | null {
    if (!isBrowser()) return null;
    return window.localStorage.getItem(buildLastSeenKey(userKey));
}

export function markDmPrSeen(userKey?: string | null, date: Date = new Date()): void {
    if (!isBrowser()) return;
    window.localStorage.setItem(buildLastSeenKey(userKey), date.toISOString());
    window.dispatchEvent(new Event(REFRESH_EVENT));
}

export function getDmUnreadRefreshEventName(): string {
    return REFRESH_EVENT;
}

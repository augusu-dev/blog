const LAST_SEEN_KEY = "dm-pr-last-seen-at";
const REFRESH_EVENT = "dm-pr-unread-refresh";

function isBrowser(): boolean {
    return typeof window !== "undefined";
}

export function getDmUnreadSince(): string | null {
    if (!isBrowser()) return null;
    return window.localStorage.getItem(LAST_SEEN_KEY);
}

export function markDmPrSeen(date: Date = new Date()): void {
    if (!isBrowser()) return;
    window.localStorage.setItem(LAST_SEEN_KEY, date.toISOString());
    window.dispatchEvent(new Event(REFRESH_EVENT));
}

export function getDmUnreadRefreshEventName(): string {
    return REFRESH_EVENT;
}

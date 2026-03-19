export const PULL_REQUEST_PUBLICATION_DAYS = 60;
export const PULL_REQUEST_EXTENSION_REQUEST_WINDOW_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

export function addDays(base: Date, days: number): Date {
    return new Date(base.getTime() + days * DAY_MS);
}

export function createPullRequestPublicationExpiry(base = new Date()): Date {
    return addDays(base, PULL_REQUEST_PUBLICATION_DAYS);
}

export function canRequestPullRequestExtension(expiresAt: Date | string | null | undefined, now = new Date()): boolean {
    if (!expiresAt) return false;

    const expiryDate = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
    if (Number.isNaN(expiryDate.getTime())) return false;
    if (expiryDate.getTime() < now.getTime()) return false;

    const windowStart = addDays(expiryDate, -PULL_REQUEST_EXTENSION_REQUEST_WINDOW_DAYS);
    return now.getTime() >= windowStart.getTime();
}

export function formatIsoDate(value: Date | string | null | undefined): string | null {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString();
}

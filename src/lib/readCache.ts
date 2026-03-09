type CacheEntry<T> = {
    value: T;
    expiresAt: number;
};

type PendingEntry<T> = {
    promise: Promise<T>;
};

type ReadCacheOptions<T> = {
    shouldCache?: (value: T) => boolean;
    useStaleOnError?: boolean;
    useStaleWhen?: (value: T, staleValue: T | null) => boolean;
};

const cacheStore = new Map<string, CacheEntry<unknown>>();
const pendingStore = new Map<string, PendingEntry<unknown>>();

function isFresh(entry: CacheEntry<unknown> | undefined): boolean {
    return !!entry && entry.expiresAt > Date.now();
}

export function peekReadCache<T>(key: string, options?: { allowExpired?: boolean }): T | null {
    const cached = cacheStore.get(key);
    if (!cached) {
        return null;
    }

    if (!options?.allowExpired && !isFresh(cached)) {
        cacheStore.delete(key);
        return null;
    }

    return cached.value as T;
}

export async function readThroughCache<T>(
    key: string,
    ttlMs: number,
    loader: () => Promise<T>,
    options?: ReadCacheOptions<T>
): Promise<T> {
    const cached = cacheStore.get(key);
    if (isFresh(cached)) {
        return cached!.value as T;
    }

    const staleValue = cached ? (cached.value as T) : null;

    const pending = pendingStore.get(key);
    if (pending) {
        return pending.promise as Promise<T>;
    }

    const promise = loader()
        .then((value) => {
            const shouldUseStale = options?.useStaleWhen?.(value, staleValue) ?? false;
            if (shouldUseStale && staleValue !== null) {
                pendingStore.delete(key);
                return staleValue;
            }

            const shouldCache = options?.shouldCache ? options.shouldCache(value) : true;
            if (shouldCache) {
                cacheStore.set(key, {
                    value,
                    expiresAt: Date.now() + ttlMs,
                });
            }
            pendingStore.delete(key);
            return value;
        })
        .catch((error) => {
            pendingStore.delete(key);
            if (options?.useStaleOnError && staleValue !== null) {
                return staleValue;
            }
            throw error;
        });

    pendingStore.set(key, { promise });

    return promise;
}

export function writeReadCache<T>(key: string, value: T, ttlMs: number): void {
    cacheStore.set(key, {
        value,
        expiresAt: Date.now() + ttlMs,
    });
}

export function invalidateReadCacheKey(key: string): void {
    cacheStore.delete(key);
    pendingStore.delete(key);
}

export function invalidateReadCachePrefix(prefix: string): void {
    for (const key of [...cacheStore.keys()]) {
        if (key.startsWith(prefix)) {
            cacheStore.delete(key);
        }
    }

    for (const key of [...pendingStore.keys()]) {
        if (key.startsWith(prefix)) {
            pendingStore.delete(key);
        }
    }
}

export function normalizeCacheKeyPart(value: unknown): string {
    return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export const readCacheKeys = {
    publicPosts: () => "public-posts",
    shortPosts: () => "short-posts",
    userProfile: (userRef: string) => `user-profile:${normalizeCacheKeyPart(userRef)}`,
    userSettings: (userId: string) => `user-settings:${normalizeCacheKeyPart(userId)}`,
    userPosts: (userId: string) => `user-posts:${normalizeCacheKeyPart(userId)}`,
    pinsFeed: (userId: string) => `pins-feed:${normalizeCacheKeyPart(userId)}`,
    pinsState: (ownerId: string, targetRef: string) =>
        `pins-state:${normalizeCacheKeyPart(ownerId)}:${normalizeCacheKeyPart(targetRef)}`,
    pinsList: (ownerId: string) => `pins-list:${normalizeCacheKeyPart(ownerId)}`,
    directMessages: (userId: string, mode: string, targetRef = "") =>
        `direct-messages:${normalizeCacheKeyPart(userId)}:${normalizeCacheKeyPart(mode)}:${normalizeCacheKeyPart(targetRef)}`,
    unread: (userId: string, since: string) =>
        `unread:${normalizeCacheKeyPart(userId)}:${normalizeCacheKeyPart(since)}`,
};

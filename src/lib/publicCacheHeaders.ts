export function buildPublicCacheHeaders(
    options?: { sMaxAge?: number; staleWhileRevalidate?: number }
) {
    const sMaxAge = Math.max(1, options?.sMaxAge ?? 30);
    const staleWhileRevalidate = Math.max(sMaxAge, options?.staleWhileRevalidate ?? 120);

    return {
        "Cache-Control": `public, s-maxage=${sMaxAge}, stale-while-revalidate=${staleWhileRevalidate}`,
    };
}

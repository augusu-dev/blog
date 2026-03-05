import { prisma } from "@/lib/db";
import { getTableColumns } from "@/lib/tableSchema";

type PublicAuthor = {
    id: string;
    userId?: string | null;
    name: string | null;
    email: string | null;
    image: string | null;
};

export type PublicPostFallback = {
    id: string;
    title: string;
    content: string;
    excerpt: string;
    headerImage: string | null;
    tags: string[];
    published: boolean;
    pinned: boolean;
    createdAt: string;
    updatedAt: string;
    authorId: string;
    author: PublicAuthor;
};

export type ShortPostFallback = {
    id: string;
    content: string;
    createdAt: string;
    authorId: string;
    author: PublicAuthor;
};

function asString(value: unknown, fallback = ""): string {
    return typeof value === "string" ? value : fallback;
}

function asNullableString(value: unknown): string | null {
    return typeof value === "string" ? value : null;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
    if (typeof value === "boolean") return value;
    if (typeof value !== "string") return fallback;

    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "t" || normalized === "1") return true;
    if (normalized === "false" || normalized === "f" || normalized === "0") return false;
    return fallback;
}

function parsePgArrayLiteral(value: string): string[] {
    const inner = value.slice(1, -1);
    if (!inner) return [];

    const items: string[] = [];
    let current = "";
    let quoted = false;
    let escaped = false;

    for (const char of inner) {
        if (escaped) {
            current += char;
            escaped = false;
            continue;
        }

        if (char === "\\") {
            escaped = true;
            continue;
        }

        if (char === '"') {
            quoted = !quoted;
            continue;
        }

        if (char === "," && !quoted) {
            const next = current.trim();
            if (next) items.push(next);
            current = "";
            continue;
        }

        current += char;
    }

    const last = current.trim();
    if (last) items.push(last);
    return items;
}

function parseTags(raw: unknown): string[] {
    if (typeof raw !== "string") return [];
    const value = raw.trim();
    if (!value || value === "{}") return [];

    if (value.startsWith("{") && value.endsWith("}")) {
        return parsePgArrayLiteral(value);
    }

    if (value.startsWith("[") && value.endsWith("]")) {
        try {
            const parsed = JSON.parse(value);
            if (Array.isArray(parsed)) {
                return parsed
                    .filter((item): item is string => typeof item === "string")
                    .map((item) => item.trim())
                    .filter(Boolean);
            }
        } catch {
            return [];
        }
    }

    return value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
}

export async function getPublicPostsFallback(limit = 300): Promise<PublicPostFallback[]> {
    const [postColumns, userColumns] = await Promise.all([getTableColumns("Post"), getTableColumns("User")]);

    const requiredPostColumns = ["id", "title", "content", "createdAt", "authorId"];
    if (requiredPostColumns.some((column) => !postColumns.has(column)) || !userColumns.has("id")) {
        return [];
    }

    const wherePublished = postColumns.has("published")
        ? `WHERE LOWER(COALESCE(p."published"::text, 'true')) IN ('true', 't', '1')`
        : "";

    const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
        `
            SELECT
                p."id"::text AS "id",
                p."title"::text AS "title",
                p."content"::text AS "content",
                ${postColumns.has("excerpt") ? `COALESCE(p."excerpt"::text, '')` : `''::text`} AS "excerpt",
                ${postColumns.has("headerImage") ? `p."headerImage"::text` : `NULL::text`} AS "headerImage",
                ${postColumns.has("tags") ? `p."tags"::text` : `NULL::text`} AS "tagsText",
                ${postColumns.has("published") ? `p."published"::text` : `'true'::text`} AS "publishedText",
                ${postColumns.has("pinned") ? `p."pinned"::text` : `'false'::text`} AS "pinnedText",
                p."createdAt"::text AS "createdAt",
                ${postColumns.has("updatedAt") ? `COALESCE(p."updatedAt"::text, p."createdAt"::text)` : `p."createdAt"::text`} AS "updatedAt",
                p."authorId"::text AS "authorId",
                u."id"::text AS "authorPk",
                ${userColumns.has("userId") ? `u."userId"::text` : `NULL::text`} AS "authorUserId",
                ${userColumns.has("name") ? `u."name"::text` : `NULL::text`} AS "authorName",
                ${userColumns.has("email") ? `u."email"::text` : `NULL::text`} AS "authorEmail",
                ${userColumns.has("image") ? `u."image"::text` : `NULL::text`} AS "authorImage"
            FROM "Post" p
            LEFT JOIN "User" u ON u."id" = p."authorId"
            ${wherePublished}
            ORDER BY p."createdAt" DESC
            LIMIT $1
        `,
        limit
    );

    return rows.map((row) => {
        const authorId = asString(row.authorPk || row.authorId);
        return {
            id: asString(row.id),
            title: asString(row.title),
            content: asString(row.content),
            excerpt: asString(row.excerpt),
            headerImage: asNullableString(row.headerImage),
            tags: parseTags(row.tagsText),
            published: asBoolean(row.publishedText, true),
            pinned: asBoolean(row.pinnedText, false),
            createdAt: asString(row.createdAt),
            updatedAt: asString(row.updatedAt, asString(row.createdAt)),
            authorId: asString(row.authorId, authorId),
            author: {
                id: authorId,
                userId: asNullableString(row.authorUserId),
                name: asNullableString(row.authorName),
                email: asNullableString(row.authorEmail),
                image: asNullableString(row.authorImage),
            },
        };
    });
}

export async function getShortPostsFallback(limit = 30): Promise<ShortPostFallback[]> {
    const [shortPostColumns, userColumns] = await Promise.all([
        getTableColumns("ShortPost"),
        getTableColumns("User"),
    ]);

    const requiredShortPostColumns = ["id", "content", "createdAt", "authorId"];
    if (requiredShortPostColumns.some((column) => !shortPostColumns.has(column)) || !userColumns.has("id")) {
        return [];
    }

    const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
        `
            SELECT
                sp."id"::text AS "id",
                sp."content"::text AS "content",
                sp."createdAt"::text AS "createdAt",
                sp."authorId"::text AS "authorId",
                u."id"::text AS "authorPk",
                ${userColumns.has("userId") ? `u."userId"::text` : `NULL::text`} AS "authorUserId",
                ${userColumns.has("name") ? `u."name"::text` : `NULL::text`} AS "authorName",
                ${userColumns.has("email") ? `u."email"::text` : `NULL::text`} AS "authorEmail",
                ${userColumns.has("image") ? `u."image"::text` : `NULL::text`} AS "authorImage"
            FROM "ShortPost" sp
            LEFT JOIN "User" u ON u."id" = sp."authorId"
            ORDER BY sp."createdAt" DESC
            LIMIT $1
        `,
        limit
    );

    return rows.map((row) => {
        const authorId = asString(row.authorPk || row.authorId);
        return {
            id: asString(row.id),
            content: asString(row.content),
            createdAt: asString(row.createdAt),
            authorId: asString(row.authorId, authorId),
            author: {
                id: authorId,
                userId: asNullableString(row.authorUserId),
                name: asNullableString(row.authorName),
                email: asNullableString(row.authorEmail),
                image: asNullableString(row.authorImage),
            },
        };
    });
}

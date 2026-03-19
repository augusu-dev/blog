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
    sourcePullRequestId: string | null;
    pullRequestProposerId: string | null;
    pullRequestProposer?: PublicAuthor | null;
    author: PublicAuthor;
};

export type ShortPostFallback = {
    id: string;
    content: string;
    createdAt: string;
    authorId: string;
    author: PublicAuthor;
};

export type UserOwnedPostFallback = {
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
    sourcePullRequestId: string | null;
    pullRequestProposerId: string | null;
    pullRequestProposer?: PublicAuthor | null;
};

export type UserProfileFallback = {
    id: string;
    userId?: string | null;
    name: string | null;
    email: string | null;
    image: string | null;
    headerImage: string | null;
    bio: string | null;
    aboutMe: string | null;
    links: string | null;
    posts: UserOwnedPostFallback[];
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

function normalizeRefList(values: Array<string | null | undefined>): string[] {
    const seen = new Set<string>();
    const refs: string[] = [];

    for (const value of values) {
        const normalized = typeof value === "string" ? value.trim() : "";
        if (!normalized || seen.has(normalized)) {
            continue;
        }
        seen.add(normalized);
        refs.push(normalized);
    }

    return refs;
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

function mapOwnedPostRow(row: Record<string, unknown>): UserOwnedPostFallback {
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
        authorId: asString(row.authorId),
        sourcePullRequestId: asNullableString(row.sourcePullRequestId),
        pullRequestProposerId: asNullableString(row.pullRequestProposerId),
    };
}

export async function getPostsByAuthorFallback(
    authorRefInput: string | Array<string | null | undefined>,
    options?: { publishedOnly?: boolean; limit?: number }
): Promise<UserOwnedPostFallback[]> {
    try {
        const postColumns = await getTableColumns("Post");
        const requiredPostColumns = ["id", "title", "content", "createdAt", "authorId"];
        const authorRefs = normalizeRefList(
            Array.isArray(authorRefInput) ? authorRefInput : [authorRefInput]
        );

        if (authorRefs.length === 0 || requiredPostColumns.some((column) => !postColumns.has(column))) {
            return [];
        }

        const publishedOnly = options?.publishedOnly === true;
        const limit = typeof options?.limit === "number" && options.limit > 0 ? options.limit : 300;
        const authorMatchClause = authorRefs
            .map((_, index) => `p."authorId"::text = $${index + 1}`)
            .join(" OR ");
        const whereClauses = [`(${authorMatchClause})`];
        const limitPlaceholder = `$${authorRefs.length + 1}`;

        if (publishedOnly && postColumns.has("published")) {
            whereClauses.push(`LOWER(COALESCE(p."published"::text, 'true')) IN ('true', 't', '1')`);
        }

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
                    ${postColumns.has("sourcePullRequestId") ? `p."sourcePullRequestId"::text` : `NULL::text`} AS "sourcePullRequestId",
                    ${postColumns.has("pullRequestProposerId") ? `p."pullRequestProposerId"::text` : `NULL::text`} AS "pullRequestProposerId"
                FROM "Post" p
                WHERE ${whereClauses.join(" AND ")}
                ORDER BY ${postColumns.has("updatedAt") ? `COALESCE(p."updatedAt", p."createdAt")` : `p."createdAt"`} DESC
                LIMIT ${limitPlaceholder}
            `,
            ...authorRefs,
            limit
        );

        return rows.map(mapOwnedPostRow);
    } catch {
        return [];
    }
}

export async function getUserProfileByRefFallback(userRef: string): Promise<UserProfileFallback | null> {
    try {
        const normalizedRef = userRef.trim();
        if (!normalizedRef) {
            return null;
        }

        const userColumns = await getTableColumns("User");
        if (!userColumns.has("id")) {
            return null;
        }

        const hasUserIdColumn = userColumns.has("userId");
        const conditions = [`u."id"::text = $1`];

        if (hasUserIdColumn) {
            conditions.push(`LOWER(COALESCE(u."userId"::text, '')) = LOWER($1)`);
        }
        if (userColumns.has("email")) {
            conditions.push(`LOWER(COALESCE(u."email"::text, '')) = LOWER($1)`);
        }
        if (userColumns.has("name")) {
            conditions.push(`LOWER(COALESCE(u."name"::text, '')) = LOWER($1)`);
        }

        const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
            `
                SELECT
                    u."id"::text AS "id",
                    ${hasUserIdColumn ? `u."userId"::text` : `NULL::text`} AS "userId",
                    ${userColumns.has("name") ? `u."name"::text` : `NULL::text`} AS "name",
                    ${userColumns.has("email") ? `u."email"::text` : `NULL::text`} AS "email",
                    ${userColumns.has("image") ? `u."image"::text` : `NULL::text`} AS "image",
                    ${userColumns.has("headerImage") ? `u."headerImage"::text` : `NULL::text`} AS "headerImage",
                    ${userColumns.has("bio") ? `u."bio"::text` : `NULL::text`} AS "bio",
                    ${userColumns.has("aboutMe") ? `u."aboutMe"::text` : `NULL::text`} AS "aboutMe",
                    ${userColumns.has("links") ? `u."links"::text` : `NULL::text`} AS "links"
                FROM "User" u
                WHERE ${conditions.join(" OR ")}
                ORDER BY
                    CASE
                        WHEN u."id"::text = $1 THEN 0
                        ${hasUserIdColumn ? `WHEN LOWER(COALESCE(u."userId"::text, '')) = LOWER($1) THEN 1` : ""}
                        ${userColumns.has("email") ? `WHEN LOWER(COALESCE(u."email"::text, '')) = LOWER($1) THEN 2` : ""}
                        ${userColumns.has("name") ? `WHEN LOWER(COALESCE(u."name"::text, '')) = LOWER($1) THEN 3` : ""}
                        ELSE 9
                    END,
                    u."id" ASC
                LIMIT 1
            `,
            normalizedRef
        );

        const row = rows[0];
        if (!row) {
            return null;
        }

        const userId = asString(row.id);
        const publicUserId = asNullableString(row.userId);
        const posts = await getPostsByAuthorFallback([userId, publicUserId], {
            publishedOnly: true,
            limit: 300,
        });

        return {
            id: userId,
            userId: asNullableString(row.userId),
            name: asNullableString(row.name),
            email: asNullableString(row.email),
            image: asNullableString(row.image),
            headerImage: asNullableString(row.headerImage),
            bio: asNullableString(row.bio),
            aboutMe: asNullableString(row.aboutMe),
            links: asNullableString(row.links),
            posts,
        };
    } catch {
        return null;
    }
}

export async function getPublicPostsFallback(limit = 300): Promise<PublicPostFallback[]> {
    try {
        const postColumns = await getTableColumns("Post");
        const userColumns = await getTableColumns("User");

        const requiredPostColumns = ["id", "title", "content", "createdAt", "authorId"];
        if (requiredPostColumns.some((column) => !postColumns.has(column)) || !userColumns.has("id")) {
            return [];
        }

        const wherePublished = postColumns.has("published")
            ? `WHERE LOWER(COALESCE(p."published"::text, 'true')) IN ('true', 't', '1')`
            : "";
        const hasUserIdColumn = userColumns.has("userId");
        const primaryUserJoin = `LEFT JOIN "User" u_pk ON u_pk."id"::text = p."authorId"::text`;
        const publicUserJoin = hasUserIdColumn
            ? `LEFT JOIN "User" u_uid ON u_uid."userId"::text = p."authorId"::text AND u_pk."id" IS NULL`
            : "";
        const authorIdSelect = `COALESCE(u_pk."id"::text, ${hasUserIdColumn ? `u_uid."id"::text, ` : ""}p."authorId"::text)`;
        const authorUserIdSelect = hasUserIdColumn
            ? `COALESCE(u_pk."userId"::text, u_uid."userId"::text)`
            : `NULL::text`;
        const authorNameSelect = hasUserIdColumn
            ? `COALESCE(u_pk."name"::text, u_uid."name"::text)`
            : `u_pk."name"::text`;
        const authorEmailSelect = hasUserIdColumn
            ? `COALESCE(u_pk."email"::text, u_uid."email"::text)`
            : `u_pk."email"::text`;
        const authorImageSelect = hasUserIdColumn
            ? `COALESCE(u_pk."image"::text, u_uid."image"::text)`
            : `u_pk."image"::text`;

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
                    ${postColumns.has("sourcePullRequestId") ? `p."sourcePullRequestId"::text` : `NULL::text`} AS "sourcePullRequestId",
                    ${postColumns.has("pullRequestProposerId") ? `p."pullRequestProposerId"::text` : `NULL::text`} AS "pullRequestProposerId",
                    ${authorIdSelect} AS "authorPk",
                    ${userColumns.has("userId") ? authorUserIdSelect : `NULL::text`} AS "authorUserId",
                    ${userColumns.has("name") ? authorNameSelect : `NULL::text`} AS "authorName",
                    ${userColumns.has("email") ? authorEmailSelect : `NULL::text`} AS "authorEmail",
                    ${userColumns.has("image") ? authorImageSelect : `NULL::text`} AS "authorImage"
                FROM "Post" p
                ${primaryUserJoin}
                ${publicUserJoin}
                ${wherePublished}
                ORDER BY p."createdAt" DESC
                LIMIT $1
            `,
            limit
        );

        return rows.map((row) => {
            const authorId = asString(row.authorPk || row.authorId);
            return {
                ...mapOwnedPostRow(row),
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
    } catch {
        return [];
    }
}

export async function getShortPostsFallback(limit = 30): Promise<ShortPostFallback[]> {
    try {
        const shortPostColumns = await getTableColumns("ShortPost");
        const userColumns = await getTableColumns("User");

        const requiredShortPostColumns = ["id", "content", "createdAt", "authorId"];
        if (requiredShortPostColumns.some((column) => !shortPostColumns.has(column)) || !userColumns.has("id")) {
            return [];
        }

        const hasUserIdColumn = userColumns.has("userId");
        const primaryUserJoin = `LEFT JOIN "User" u_pk ON u_pk."id"::text = sp."authorId"::text`;
        const publicUserJoin = hasUserIdColumn
            ? `LEFT JOIN "User" u_uid ON u_uid."userId"::text = sp."authorId"::text AND u_pk."id" IS NULL`
            : "";
        const authorIdSelect = `COALESCE(u_pk."id"::text, ${hasUserIdColumn ? `u_uid."id"::text, ` : ""}sp."authorId"::text)`;
        const authorUserIdSelect = hasUserIdColumn
            ? `COALESCE(u_pk."userId"::text, u_uid."userId"::text)`
            : `NULL::text`;
        const authorNameSelect = hasUserIdColumn
            ? `COALESCE(u_pk."name"::text, u_uid."name"::text)`
            : `u_pk."name"::text`;
        const authorEmailSelect = hasUserIdColumn
            ? `COALESCE(u_pk."email"::text, u_uid."email"::text)`
            : `u_pk."email"::text`;
        const authorImageSelect = hasUserIdColumn
            ? `COALESCE(u_pk."image"::text, u_uid."image"::text)`
            : `u_pk."image"::text`;

        const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
            `
                SELECT
                    sp."id"::text AS "id",
                    sp."content"::text AS "content",
                    sp."createdAt"::text AS "createdAt",
                    sp."authorId"::text AS "authorId",
                    ${authorIdSelect} AS "authorPk",
                    ${userColumns.has("userId") ? authorUserIdSelect : `NULL::text`} AS "authorUserId",
                    ${userColumns.has("name") ? authorNameSelect : `NULL::text`} AS "authorName",
                    ${userColumns.has("email") ? authorEmailSelect : `NULL::text`} AS "authorEmail",
                    ${userColumns.has("image") ? authorImageSelect : `NULL::text`} AS "authorImage"
                FROM "ShortPost" sp
                ${primaryUserJoin}
                ${publicUserJoin}
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
    } catch {
        return [];
    }
}

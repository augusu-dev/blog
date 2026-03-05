import { prisma } from "@/lib/db";

const ADD_USER_HEADER_IMAGE_SQL = `
ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "headerImage" TEXT
`;

const ADD_USER_BIO_SQL = `
ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "bio" TEXT
`;

const ADD_USER_ABOUT_ME_SQL = `
ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "aboutMe" TEXT
`;

const ADD_USER_LINKS_SQL = `
ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "links" TEXT
`;

const ADD_POST_EXCERPT_SQL = `
ALTER TABLE "Post"
ADD COLUMN IF NOT EXISTS "excerpt" TEXT
`;

const ADD_POST_HEADER_IMAGE_SQL = `
ALTER TABLE "Post"
ADD COLUMN IF NOT EXISTS "headerImage" TEXT
`;

const ADD_POST_TAGS_SQL = `
ALTER TABLE "Post"
ADD COLUMN IF NOT EXISTS "tags" TEXT[]
`;

const BACKFILL_POST_TAGS_SQL = `
UPDATE "Post"
SET "tags" = ARRAY[]::TEXT[]
WHERE "tags" IS NULL
`;

const POST_TAGS_NOT_NULL_SQL = `
ALTER TABLE "Post"
ALTER COLUMN "tags" SET NOT NULL
`;

const POST_TAGS_DEFAULT_SQL = `
ALTER TABLE "Post"
ALTER COLUMN "tags" SET DEFAULT ARRAY[]::TEXT[]
`;

const ADD_POST_PUBLISHED_SQL = `
ALTER TABLE "Post"
ADD COLUMN IF NOT EXISTS "published" BOOLEAN
`;

const BACKFILL_POST_PUBLISHED_SQL = `
UPDATE "Post"
SET "published" = TRUE
WHERE "published" IS NULL
`;

const POST_PUBLISHED_NOT_NULL_SQL = `
ALTER TABLE "Post"
ALTER COLUMN "published" SET NOT NULL
`;

const POST_PUBLISHED_DEFAULT_SQL = `
ALTER TABLE "Post"
ALTER COLUMN "published" SET DEFAULT FALSE
`;

const ADD_POST_PINNED_SQL = `
ALTER TABLE "Post"
ADD COLUMN IF NOT EXISTS "pinned" BOOLEAN
`;

const BACKFILL_POST_PINNED_SQL = `
UPDATE "Post"
SET "pinned" = FALSE
WHERE "pinned" IS NULL
`;

const POST_PINNED_NOT_NULL_SQL = `
ALTER TABLE "Post"
ALTER COLUMN "pinned" SET NOT NULL
`;

const POST_PINNED_DEFAULT_SQL = `
ALTER TABLE "Post"
ALTER COLUMN "pinned" SET DEFAULT FALSE
`;

const ADD_POST_UPDATED_AT_SQL = `
ALTER TABLE "Post"
ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3)
`;

const BACKFILL_POST_UPDATED_AT_SQL = `
UPDATE "Post"
SET "updatedAt" = COALESCE("createdAt", CURRENT_TIMESTAMP)
WHERE "updatedAt" IS NULL
`;

const POST_UPDATED_AT_NOT_NULL_SQL = `
ALTER TABLE "Post"
ALTER COLUMN "updatedAt" SET NOT NULL
`;

const POST_UPDATED_AT_DEFAULT_SQL = `
ALTER TABLE "Post"
ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP
`;

const PROFILE_AND_POST_SCHEMA_SQL = [
    ADD_USER_HEADER_IMAGE_SQL,
    ADD_USER_BIO_SQL,
    ADD_USER_ABOUT_ME_SQL,
    ADD_USER_LINKS_SQL,
    ADD_POST_EXCERPT_SQL,
    ADD_POST_HEADER_IMAGE_SQL,
    ADD_POST_TAGS_SQL,
    BACKFILL_POST_TAGS_SQL,
    POST_TAGS_NOT_NULL_SQL,
    POST_TAGS_DEFAULT_SQL,
    ADD_POST_PUBLISHED_SQL,
    BACKFILL_POST_PUBLISHED_SQL,
    POST_PUBLISHED_NOT_NULL_SQL,
    POST_PUBLISHED_DEFAULT_SQL,
    ADD_POST_PINNED_SQL,
    BACKFILL_POST_PINNED_SQL,
    POST_PINNED_NOT_NULL_SQL,
    POST_PINNED_DEFAULT_SQL,
    ADD_POST_UPDATED_AT_SQL,
    BACKFILL_POST_UPDATED_AT_SQL,
    POST_UPDATED_AT_NOT_NULL_SQL,
    POST_UPDATED_AT_DEFAULT_SQL,
] as const;

let schemaEnsured = false;
let ensureProfileAndPostSchemaPromise: Promise<void> | null = null;

function isIgnorableSchemaEnsureError(error: unknown): boolean {
    if (error instanceof Error) {
        return /permission denied|must be owner|already exists|duplicate/i.test(error.message);
    }
    return false;
}

async function executeSchemaStatement(sql: string): Promise<void> {
    try {
        await prisma.$executeRawUnsafe(sql);
    } catch (error) {
        if (!isIgnorableSchemaEnsureError(error)) {
            throw error;
        }
    }
}

export async function ensureProfileAndPostSchema(): Promise<void> {
    if (schemaEnsured) {
        return;
    }

    if (!ensureProfileAndPostSchemaPromise) {
        ensureProfileAndPostSchemaPromise = (async () => {
            for (const sql of PROFILE_AND_POST_SCHEMA_SQL) {
                await executeSchemaStatement(sql);
            }
            schemaEnsured = true;
        })()
            .catch((error) => {
                schemaEnsured = false;
                throw error;
            })
            .finally(() => {
                ensureProfileAndPostSchemaPromise = null;
            });
    }

    await ensureProfileAndPostSchemaPromise;
}

export async function tryEnsureProfileAndPostSchema(): Promise<void> {
    try {
        await ensureProfileAndPostSchema();
    } catch {
        // Reads still use query-level fallbacks when schema updates are unavailable.
    }
}

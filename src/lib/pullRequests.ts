import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

const CREATE_PULL_REQUEST_STATUS_ENUM_SQL = `
DO $$
BEGIN
  CREATE TYPE "PullRequestStatus" AS ENUM ('PENDING', 'ON_HOLD', 'ACCEPTED', 'REJECTED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
`;

const ADD_ON_HOLD_STATUS_ENUM_SQL = `
DO $$
BEGIN
  ALTER TYPE "PullRequestStatus" ADD VALUE IF NOT EXISTS 'ON_HOLD';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
`;

const CREATE_PULL_REQUEST_KIND_ENUM_SQL = `
DO $$
BEGIN
  CREATE TYPE "PullRequestKind" AS ENUM ('SUBMISSION', 'EXTENSION');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
`;

const CREATE_ARTICLE_PULL_REQUEST_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS "ArticlePullRequest" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "excerpt" TEXT,
  "content" TEXT NOT NULL,
  "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "kind" "PullRequestKind" NOT NULL DEFAULT 'SUBMISSION',
  "status" "PullRequestStatus" NOT NULL DEFAULT 'PENDING',
  "publicationExpiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "postId" TEXT,
  "proposerId" TEXT NOT NULL,
  "recipientId" TEXT NOT NULL,
  CONSTRAINT "ArticlePullRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ArticlePullRequest_proposerId_fkey" FOREIGN KEY ("proposerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ArticlePullRequest_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
`;

const ADD_EXCERPT_COLUMN_SQL = `
ALTER TABLE "ArticlePullRequest"
ADD COLUMN IF NOT EXISTS "excerpt" TEXT
`;

const ADD_TAGS_COLUMN_SQL = `
ALTER TABLE "ArticlePullRequest"
ADD COLUMN IF NOT EXISTS "tags" TEXT[]
`;

const BACKFILL_TAGS_SQL = `
UPDATE "ArticlePullRequest"
SET "tags" = ARRAY[]::TEXT[]
WHERE "tags" IS NULL
`;

const TAGS_NOT_NULL_SQL = `
ALTER TABLE "ArticlePullRequest"
ALTER COLUMN "tags" SET NOT NULL
`;

const TAGS_DEFAULT_SQL = `
ALTER TABLE "ArticlePullRequest"
ALTER COLUMN "tags" SET DEFAULT ARRAY[]::TEXT[]
`;

const ADD_KIND_COLUMN_SQL = `
ALTER TABLE "ArticlePullRequest"
ADD COLUMN IF NOT EXISTS "kind" "PullRequestKind"
`;

const BACKFILL_KIND_SQL = `
UPDATE "ArticlePullRequest"
SET "kind" = 'SUBMISSION'
WHERE "kind" IS NULL
`;

const KIND_NOT_NULL_SQL = `
ALTER TABLE "ArticlePullRequest"
ALTER COLUMN "kind" SET NOT NULL
`;

const KIND_DEFAULT_SQL = `
ALTER TABLE "ArticlePullRequest"
ALTER COLUMN "kind" SET DEFAULT 'SUBMISSION'
`;

const ADD_STATUS_COLUMN_SQL = `
ALTER TABLE "ArticlePullRequest"
ADD COLUMN IF NOT EXISTS "status" "PullRequestStatus" NOT NULL DEFAULT 'PENDING'
`;

const ADD_PUBLICATION_EXPIRES_AT_COLUMN_SQL = `
ALTER TABLE "ArticlePullRequest"
ADD COLUMN IF NOT EXISTS "publicationExpiresAt" TIMESTAMP(3)
`;

const ADD_UPDATED_AT_COLUMN_SQL = `
ALTER TABLE "ArticlePullRequest"
ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3)
`;

const BACKFILL_UPDATED_AT_SQL = `
UPDATE "ArticlePullRequest"
SET "updatedAt" = COALESCE("createdAt", CURRENT_TIMESTAMP)
WHERE "updatedAt" IS NULL
`;

const UPDATED_AT_NOT_NULL_SQL = `
ALTER TABLE "ArticlePullRequest"
ALTER COLUMN "updatedAt" SET NOT NULL
`;

const UPDATED_AT_DEFAULT_SQL = `
ALTER TABLE "ArticlePullRequest"
ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP
`;

const ADD_POST_ID_COLUMN_SQL = `
ALTER TABLE "ArticlePullRequest"
ADD COLUMN IF NOT EXISTS "postId" TEXT
`;

const CREATE_RECIPIENT_INDEX_SQL = `
CREATE INDEX IF NOT EXISTS "ArticlePullRequest_recipientId_createdAt_idx"
ON "ArticlePullRequest"("recipientId", "createdAt")
`;

const CREATE_PROPOSER_INDEX_SQL = `
CREATE INDEX IF NOT EXISTS "ArticlePullRequest_proposerId_createdAt_idx"
ON "ArticlePullRequest"("proposerId", "createdAt")
`;

const CREATE_POST_ID_INDEX_SQL = `
CREATE INDEX IF NOT EXISTS "ArticlePullRequest_postId_createdAt_idx"
ON "ArticlePullRequest"("postId", "createdAt")
`;

const CREATE_POST_PUBLICATION_GRANT_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS "PostPublicationGrant" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "postId" TEXT NOT NULL,
  "hostUserId" TEXT NOT NULL,
  "sourcePullRequestId" TEXT,
  CONSTRAINT "PostPublicationGrant_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PostPublicationGrant_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PostPublicationGrant_hostUserId_fkey" FOREIGN KEY ("hostUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PostPublicationGrant_sourcePullRequestId_fkey" FOREIGN KEY ("sourcePullRequestId") REFERENCES "ArticlePullRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
`;

const CREATE_PUBLICATION_GRANT_UNIQUE_INDEX_SQL = `
CREATE UNIQUE INDEX IF NOT EXISTS "PostPublicationGrant_postId_hostUserId_key"
ON "PostPublicationGrant"("postId", "hostUserId")
`;

const CREATE_PUBLICATION_GRANT_HOST_INDEX_SQL = `
CREATE INDEX IF NOT EXISTS "PostPublicationGrant_hostUserId_expiresAt_idx"
ON "PostPublicationGrant"("hostUserId", "expiresAt")
`;

const CREATE_PUBLICATION_GRANT_POST_INDEX_SQL = `
CREATE INDEX IF NOT EXISTS "PostPublicationGrant_postId_expiresAt_idx"
ON "PostPublicationGrant"("postId", "expiresAt")
`;

let schemaEnsured = false;
let ensureSchemaPromise: Promise<void> | null = null;

function isMissingPullRequestSchemaError(error: unknown): boolean {
    return (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === "P2021" || error.code === "P2022")
    );
}

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

export async function ensurePullRequestSchema(): Promise<void> {
    if (schemaEnsured) {
        return;
    }

    if (!ensureSchemaPromise) {
        ensureSchemaPromise = (async () => {
            const statements = [
                CREATE_PULL_REQUEST_STATUS_ENUM_SQL,
                ADD_ON_HOLD_STATUS_ENUM_SQL,
                CREATE_PULL_REQUEST_KIND_ENUM_SQL,
                CREATE_ARTICLE_PULL_REQUEST_TABLE_SQL,
                ADD_EXCERPT_COLUMN_SQL,
                ADD_TAGS_COLUMN_SQL,
                BACKFILL_TAGS_SQL,
                TAGS_NOT_NULL_SQL,
                TAGS_DEFAULT_SQL,
                ADD_KIND_COLUMN_SQL,
                BACKFILL_KIND_SQL,
                KIND_NOT_NULL_SQL,
                KIND_DEFAULT_SQL,
                ADD_STATUS_COLUMN_SQL,
                ADD_PUBLICATION_EXPIRES_AT_COLUMN_SQL,
                ADD_UPDATED_AT_COLUMN_SQL,
                BACKFILL_UPDATED_AT_SQL,
                UPDATED_AT_NOT_NULL_SQL,
                UPDATED_AT_DEFAULT_SQL,
                ADD_POST_ID_COLUMN_SQL,
                CREATE_RECIPIENT_INDEX_SQL,
                CREATE_PROPOSER_INDEX_SQL,
                CREATE_POST_ID_INDEX_SQL,
                CREATE_POST_PUBLICATION_GRANT_TABLE_SQL,
                CREATE_PUBLICATION_GRANT_UNIQUE_INDEX_SQL,
                CREATE_PUBLICATION_GRANT_HOST_INDEX_SQL,
                CREATE_PUBLICATION_GRANT_POST_INDEX_SQL,
            ] as const;

            for (const sql of statements) {
                await executeSchemaStatement(sql);
            }

            schemaEnsured = true;
        })()
            .catch((error) => {
                schemaEnsured = false;
                throw error;
            })
            .finally(() => {
                ensureSchemaPromise = null;
            });
    }

    await ensureSchemaPromise;
}

export async function withPullRequestTable<T>(operation: () => Promise<T>): Promise<T> {
    try {
        return await operation();
    } catch (error) {
        if (!isMissingPullRequestSchemaError(error)) {
            throw error;
        }
    }

    await ensurePullRequestSchema();
    return operation();
}

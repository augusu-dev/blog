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

const CREATE_ARTICLE_PULL_REQUEST_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS "ArticlePullRequest" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "excerpt" TEXT,
  "content" TEXT NOT NULL,
  "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "status" "PullRequestStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
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

const ADD_STATUS_COLUMN_SQL = `
ALTER TABLE "ArticlePullRequest"
ADD COLUMN IF NOT EXISTS "status" "PullRequestStatus" NOT NULL DEFAULT 'PENDING'
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

const CREATE_RECIPIENT_INDEX_SQL = `
CREATE INDEX IF NOT EXISTS "ArticlePullRequest_recipientId_createdAt_idx"
ON "ArticlePullRequest"("recipientId", "createdAt")
`;

const CREATE_PROPOSER_INDEX_SQL = `
CREATE INDEX IF NOT EXISTS "ArticlePullRequest_proposerId_createdAt_idx"
ON "ArticlePullRequest"("proposerId", "createdAt")
`;

let schemaEnsured = false;
let ensureSchemaPromise: Promise<void> | null = null;

function isMissingPullRequestSchemaError(error: unknown): boolean {
    return (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === "P2021" || error.code === "P2022")
    );
}

export async function ensurePullRequestSchema(): Promise<void> {
    if (schemaEnsured) {
        return;
    }

    if (!ensureSchemaPromise) {
        ensureSchemaPromise = (async () => {
            await prisma.$executeRawUnsafe(CREATE_PULL_REQUEST_STATUS_ENUM_SQL);
            await prisma.$executeRawUnsafe(ADD_ON_HOLD_STATUS_ENUM_SQL);
            await prisma.$executeRawUnsafe(CREATE_ARTICLE_PULL_REQUEST_TABLE_SQL);
            await prisma.$executeRawUnsafe(ADD_EXCERPT_COLUMN_SQL);
            await prisma.$executeRawUnsafe(ADD_TAGS_COLUMN_SQL);
            await prisma.$executeRawUnsafe(BACKFILL_TAGS_SQL);
            await prisma.$executeRawUnsafe(TAGS_NOT_NULL_SQL);
            await prisma.$executeRawUnsafe(TAGS_DEFAULT_SQL);
            await prisma.$executeRawUnsafe(ADD_STATUS_COLUMN_SQL);
            await prisma.$executeRawUnsafe(ADD_UPDATED_AT_COLUMN_SQL);
            await prisma.$executeRawUnsafe(BACKFILL_UPDATED_AT_SQL);
            await prisma.$executeRawUnsafe(UPDATED_AT_NOT_NULL_SQL);
            await prisma.$executeRawUnsafe(UPDATED_AT_DEFAULT_SQL);
            await prisma.$executeRawUnsafe(CREATE_RECIPIENT_INDEX_SQL);
            await prisma.$executeRawUnsafe(CREATE_PROPOSER_INDEX_SQL);
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

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

const CREATE_POST_COMMENT_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS "PostComment" (
  "id" TEXT NOT NULL,
  "content" VARCHAR(1000) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "postId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  CONSTRAINT "PostComment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PostComment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PostComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
)
`;

const CREATE_POST_COMMENT_INDEX_SQL = `
CREATE INDEX IF NOT EXISTS "PostComment_postId_authorId_createdAt_idx"
ON "PostComment"("postId", "authorId", "createdAt")
`;

const ADD_POST_COMMENT_UPDATED_AT_SQL = `
ALTER TABLE "PostComment"
ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3)
`;

const BACKFILL_POST_COMMENT_UPDATED_AT_SQL = `
UPDATE "PostComment"
SET "updatedAt" = COALESCE("createdAt", CURRENT_TIMESTAMP)
WHERE "updatedAt" IS NULL
`;

const POST_COMMENT_UPDATED_AT_NOT_NULL_SQL = `
ALTER TABLE "PostComment"
ALTER COLUMN "updatedAt" SET NOT NULL
`;

const POST_COMMENT_UPDATED_AT_DEFAULT_SQL = `
ALTER TABLE "PostComment"
ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP
`;

export const COMMENT_AUTHOR_SELECT = {
    id: true,
    name: true,
    email: true,
    image: true,
} as const;

function isMissingTableError(error: unknown): boolean {
    return (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === "P2021" || error.code === "P2022")
    );
}

export async function ensurePostCommentTable(): Promise<void> {
    await prisma.$executeRawUnsafe(CREATE_POST_COMMENT_TABLE_SQL);
    await prisma.$executeRawUnsafe(CREATE_POST_COMMENT_INDEX_SQL);
    await prisma.$executeRawUnsafe(ADD_POST_COMMENT_UPDATED_AT_SQL);
    await prisma.$executeRawUnsafe(BACKFILL_POST_COMMENT_UPDATED_AT_SQL);
    await prisma.$executeRawUnsafe(POST_COMMENT_UPDATED_AT_NOT_NULL_SQL);
    await prisma.$executeRawUnsafe(POST_COMMENT_UPDATED_AT_DEFAULT_SQL);
}

export async function withPostCommentTable<T>(operation: () => Promise<T>): Promise<T> {
    try {
        return await operation();
    } catch (error) {
        if (!isMissingTableError(error)) {
            throw error;
        }
    }

    await ensurePostCommentTable();
    return operation();
}

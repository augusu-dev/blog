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

export const COMMENT_AUTHOR_SELECT = {
    id: true,
    name: true,
    email: true,
    image: true,
} as const;

function isMissingTableError(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2021";
}

export async function ensurePostCommentTable(): Promise<void> {
    await prisma.$executeRawUnsafe(CREATE_POST_COMMENT_TABLE_SQL);
    await prisma.$executeRawUnsafe(CREATE_POST_COMMENT_INDEX_SQL);
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

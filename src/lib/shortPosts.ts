import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

const CREATE_SHORT_POST_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS "ShortPost" (
  "id" TEXT NOT NULL,
  "content" VARCHAR(300) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "authorId" TEXT NOT NULL,
  CONSTRAINT "ShortPost_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ShortPost_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
)
`;

const CREATE_SHORT_POST_CREATED_AT_INDEX_SQL = `
CREATE INDEX IF NOT EXISTS "ShortPost_createdAt_idx"
ON "ShortPost"("createdAt")
`;

const CREATE_SHORT_POST_AUTHOR_INDEX_SQL = `
CREATE INDEX IF NOT EXISTS "ShortPost_authorId_createdAt_idx"
ON "ShortPost"("authorId", "createdAt")
`;

function isMissingShortPostSchemaError(error: unknown): boolean {
    return (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === "P2021" || error.code === "P2022")
    );
}

export async function ensureShortPostSchema(): Promise<void> {
    await prisma.$executeRawUnsafe(CREATE_SHORT_POST_TABLE_SQL);
    await prisma.$executeRawUnsafe(CREATE_SHORT_POST_CREATED_AT_INDEX_SQL);
    await prisma.$executeRawUnsafe(CREATE_SHORT_POST_AUTHOR_INDEX_SQL);
}

export async function withShortPostTable<T>(operation: () => Promise<T>): Promise<T> {
    try {
        return await operation();
    } catch (error) {
        if (!isMissingShortPostSchemaError(error)) {
            throw error;
        }
    }

    await ensureShortPostSchema();
    return operation();
}

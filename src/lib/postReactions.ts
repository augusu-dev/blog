import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export const REACTION_TYPES = ["GOOD", "SURPRISED", "SMIRK", "FIRE", "ROCKET"] as const;
export type ReactionType = (typeof REACTION_TYPES)[number];

const CREATE_POST_REACTION_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS "PostReaction" (
  "id" TEXT NOT NULL,
  "reaction" VARCHAR(24) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "postId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  CONSTRAINT "PostReaction_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PostReaction_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PostReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
)
`;

const CREATE_POST_REACTION_UNIQUE_SQL = `
CREATE UNIQUE INDEX IF NOT EXISTS "PostReaction_postId_userId_reaction_key"
ON "PostReaction"("postId", "userId", "reaction")
`;

const DELETE_POST_REACTION_DUPLICATES_SQL = `
WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "postId", "userId"
      ORDER BY "createdAt" DESC, "id" DESC
    ) AS rn
  FROM "PostReaction"
)
DELETE FROM "PostReaction"
WHERE "id" IN (
  SELECT "id" FROM ranked WHERE rn > 1
)
`;

const CREATE_POST_REACTION_USER_UNIQUE_SQL = `
CREATE UNIQUE INDEX IF NOT EXISTS "PostReaction_postId_userId_key"
ON "PostReaction"("postId", "userId")
`;

const CREATE_POST_REACTION_INDEX_SQL = `
CREATE INDEX IF NOT EXISTS "PostReaction_postId_createdAt_idx"
ON "PostReaction"("postId", "createdAt")
`;

function isMissingTableError(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2021";
}

export function isReactionType(value: string): value is ReactionType {
    return (REACTION_TYPES as readonly string[]).includes(value);
}

export async function ensurePostReactionTable(): Promise<void> {
    await prisma.$executeRawUnsafe(CREATE_POST_REACTION_TABLE_SQL);
    await prisma.$executeRawUnsafe(CREATE_POST_REACTION_UNIQUE_SQL);
    await prisma.$executeRawUnsafe(DELETE_POST_REACTION_DUPLICATES_SQL);
    await prisma.$executeRawUnsafe(CREATE_POST_REACTION_USER_UNIQUE_SQL);
    await prisma.$executeRawUnsafe(CREATE_POST_REACTION_INDEX_SQL);
}

export async function withPostReactionTable<T>(operation: () => Promise<T>): Promise<T> {
    try {
        return await operation();
    } catch (error) {
        if (!isMissingTableError(error)) {
            throw error;
        }
    }

    await ensurePostReactionTable();
    return operation();
}

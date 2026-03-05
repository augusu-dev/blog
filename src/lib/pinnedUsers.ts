import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

const CREATE_PINNED_USER_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS "PinnedUser" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ownerId" TEXT NOT NULL,
  "pinnedUserId" TEXT NOT NULL,
  CONSTRAINT "PinnedUser_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PinnedUser_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PinnedUser_pinnedUserId_fkey" FOREIGN KEY ("pinnedUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
)
`;

const CREATE_PINNED_USER_UNIQUE_SQL = `
CREATE UNIQUE INDEX IF NOT EXISTS "PinnedUser_ownerId_pinnedUserId_key"
ON "PinnedUser"("ownerId", "pinnedUserId")
`;

const CREATE_PINNED_USER_OWNER_INDEX_SQL = `
CREATE INDEX IF NOT EXISTS "PinnedUser_ownerId_createdAt_idx"
ON "PinnedUser"("ownerId", "createdAt")
`;

const CREATE_PINNED_USER_TARGET_INDEX_SQL = `
CREATE INDEX IF NOT EXISTS "PinnedUser_pinnedUserId_createdAt_idx"
ON "PinnedUser"("pinnedUserId", "createdAt")
`;

function isMissingPinnedUserSchemaError(error: unknown): boolean {
    return (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === "P2021" || error.code === "P2022")
    );
}

export async function ensurePinnedUserSchema(): Promise<void> {
    await prisma.$executeRawUnsafe(CREATE_PINNED_USER_TABLE_SQL);
    await prisma.$executeRawUnsafe(CREATE_PINNED_USER_UNIQUE_SQL);
    await prisma.$executeRawUnsafe(CREATE_PINNED_USER_OWNER_INDEX_SQL);
    await prisma.$executeRawUnsafe(CREATE_PINNED_USER_TARGET_INDEX_SQL);
}

export async function withPinnedUserTable<T>(operation: () => Promise<T>): Promise<T> {
    try {
        return await operation();
    } catch (error) {
        if (!isMissingPinnedUserSchemaError(error)) {
            throw error;
        }
    }

    await ensurePinnedUserSchema();
    return operation();
}

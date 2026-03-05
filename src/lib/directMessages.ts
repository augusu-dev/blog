import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

const CREATE_CONTEXT_ENUM_SQL = `
DO $$
BEGIN
  CREATE TYPE "DirectMessageContext" AS ENUM ('GENERAL', 'PULL_REQUEST');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
`;

const CREATE_DIRECT_MESSAGE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS "DirectMessage" (
  "id" TEXT NOT NULL,
  "content" VARCHAR(10000) NOT NULL,
  "context" "DirectMessageContext" NOT NULL DEFAULT 'GENERAL',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "senderId" TEXT NOT NULL,
  "recipientId" TEXT NOT NULL,
  "pullRequestId" TEXT,
  CONSTRAINT "DirectMessage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DirectMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DirectMessage_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
`;

const ADD_CONTEXT_COLUMN_SQL = `
ALTER TABLE "DirectMessage"
ADD COLUMN IF NOT EXISTS "context" "DirectMessageContext" NOT NULL DEFAULT 'GENERAL'
`;

const ADD_PULL_REQUEST_COLUMN_SQL = `
ALTER TABLE "DirectMessage"
ADD COLUMN IF NOT EXISTS "pullRequestId" TEXT
`;

const CREATE_RECIPIENT_INDEX_SQL = `
CREATE INDEX IF NOT EXISTS "DirectMessage_recipientId_createdAt_idx"
ON "DirectMessage"("recipientId", "createdAt")
`;

const CREATE_SENDER_INDEX_SQL = `
CREATE INDEX IF NOT EXISTS "DirectMessage_senderId_createdAt_idx"
ON "DirectMessage"("senderId", "createdAt")
`;

const CREATE_PULL_REQUEST_INDEX_SQL = `
CREATE INDEX IF NOT EXISTS "DirectMessage_pullRequestId_idx"
ON "DirectMessage"("pullRequestId")
`;

const EXPAND_DIRECT_MESSAGE_CONTENT_SQL = `
ALTER TABLE "DirectMessage"
ALTER COLUMN "content" TYPE VARCHAR(10000)
`;

const CREATE_DIRECT_MESSAGE_GOOD_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS "DirectMessageGood" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "messageId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  CONSTRAINT "DirectMessageGood_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DirectMessageGood_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "DirectMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DirectMessageGood_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
`;

const CREATE_DIRECT_MESSAGE_GOOD_UNIQUE_SQL = `
CREATE UNIQUE INDEX IF NOT EXISTS "DirectMessageGood_messageId_userId_key"
ON "DirectMessageGood"("messageId", "userId")
`;

const CREATE_DIRECT_MESSAGE_GOOD_INDEX_SQL = `
CREATE INDEX IF NOT EXISTS "DirectMessageGood_messageId_createdAt_idx"
ON "DirectMessageGood"("messageId", "createdAt")
`;

let schemaEnsured = false;
let ensureSchemaPromise: Promise<void> | null = null;

function isMissingDirectMessageSchemaError(error: unknown): boolean {
    return (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === "P2021" || error.code === "P2022")
    );
}

export async function ensureDirectMessageSchema(): Promise<void> {
    if (schemaEnsured) {
        return;
    }

    if (!ensureSchemaPromise) {
        ensureSchemaPromise = (async () => {
            await prisma.$executeRawUnsafe(CREATE_CONTEXT_ENUM_SQL);
            await prisma.$executeRawUnsafe(CREATE_DIRECT_MESSAGE_TABLE_SQL);
            await prisma.$executeRawUnsafe(ADD_CONTEXT_COLUMN_SQL);
            await prisma.$executeRawUnsafe(ADD_PULL_REQUEST_COLUMN_SQL);
            await prisma.$executeRawUnsafe(CREATE_RECIPIENT_INDEX_SQL);
            await prisma.$executeRawUnsafe(CREATE_SENDER_INDEX_SQL);
            await prisma.$executeRawUnsafe(CREATE_PULL_REQUEST_INDEX_SQL);
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

export async function ensureDirectMessageCapacity(): Promise<void> {
    await ensureDirectMessageSchema();
    await prisma.$executeRawUnsafe(EXPAND_DIRECT_MESSAGE_CONTENT_SQL);
}

export async function ensureDirectMessageGoodSchema(): Promise<void> {
    await ensureDirectMessageSchema();
    await prisma.$executeRawUnsafe(CREATE_DIRECT_MESSAGE_GOOD_TABLE_SQL);
    await prisma.$executeRawUnsafe(CREATE_DIRECT_MESSAGE_GOOD_UNIQUE_SQL);
    await prisma.$executeRawUnsafe(CREATE_DIRECT_MESSAGE_GOOD_INDEX_SQL);
}

export async function withDirectMessageTable<T>(operation: () => Promise<T>): Promise<T> {
    try {
        return await operation();
    } catch (error) {
        if (!isMissingDirectMessageSchemaError(error)) {
            throw error;
        }
    }

    await ensureDirectMessageSchema();
    return operation();
}

export async function withDirectMessageGoodTable<T>(operation: () => Promise<T>): Promise<T> {
    try {
        return await operation();
    } catch (error) {
        if (!isMissingDirectMessageSchemaError(error)) {
            throw error;
        }
    }

    await ensureDirectMessageGoodSchema();
    return operation();
}

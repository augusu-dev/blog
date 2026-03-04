import { prisma } from "@/lib/db";

const EXPAND_DIRECT_MESSAGE_CONTENT_SQL = `
ALTER TABLE "DirectMessage"
ALTER COLUMN "content" TYPE VARCHAR(10000)
`;

export async function ensureDirectMessageCapacity(): Promise<void> {
    await prisma.$executeRawUnsafe(EXPAND_DIRECT_MESSAGE_CONTENT_SQL);
}

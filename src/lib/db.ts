import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * Prismaクライアントの取得（遅延初期化）
 * ビルド時にDATABASE_URLが未設定でもクラッシュしない
 */
export function getPrisma(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = new PrismaClient();
  }
  return globalForPrisma.prisma;
}

// 後方互換のためのエクスポート（ランタイムで初めてアクセスされた時に初期化）
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    return (getPrisma() as unknown as Record<string | symbol, unknown>)[prop];
  },
});

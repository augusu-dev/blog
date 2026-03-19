import { Prisma, PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function buildPrismaDatabaseUrl(rawUrl: string | undefined): string | undefined {
  const normalizedUrl = rawUrl?.trim();
  if (!normalizedUrl || process.env.NODE_ENV !== "production") {
    return normalizedUrl;
  }

  try {
    const parsed = new URL(normalizedUrl);
    if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
      return normalizedUrl;
    }

    if (!parsed.searchParams.has("connection_limit")) {
      parsed.searchParams.set("connection_limit", "1");
    }
    if (!parsed.searchParams.has("pool_timeout")) {
      parsed.searchParams.set("pool_timeout", "15");
    }

    return parsed.toString();
  } catch {
    return normalizedUrl;
  }
}

const prismaOptions: Prisma.PrismaClientOptions = {
  log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
};

const prismaDatabaseUrl = buildPrismaDatabaseUrl(process.env.DATABASE_URL);
if (prismaDatabaseUrl) {
  prismaOptions.datasources = {
    db: {
      url: prismaDatabaseUrl,
    },
  };
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient(prismaOptions);

globalForPrisma.prisma = prisma;

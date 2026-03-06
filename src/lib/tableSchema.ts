import { prisma } from "@/lib/db";

const columnCache = new Map<string, Promise<Set<string>>>();

type ColumnRow = {
    column_name: string;
};

export async function getTableColumns(tableName: string): Promise<Set<string>> {
    const cached = columnCache.get(tableName);
    if (cached) {
        return new Set(await cached);
    }

    const pending = (async () => {
        const preferredRows = await prisma.$queryRawUnsafe<ColumnRow[]>(
            `
                SELECT DISTINCT "column_name"
                FROM "information_schema"."columns"
                WHERE "table_name" = $1
                  AND (
                    "table_schema" = ANY(current_schemas(false))
                    OR "table_schema" = 'public'
                  )
            `,
            tableName
        );

        if (preferredRows.length > 0) {
            return new Set(preferredRows.map((row) => String(row.column_name)));
        }

        const fallbackRows = await prisma.$queryRawUnsafe<ColumnRow[]>(
            `
                SELECT DISTINCT "column_name"
                FROM "information_schema"."columns"
                WHERE "table_name" = $1
                  AND "table_schema" NOT IN ('pg_catalog', 'information_schema')
            `,
            tableName
        );

        return new Set(fallbackRows.map((row) => String(row.column_name)));
    })();

    columnCache.set(tableName, pending);

    try {
        return new Set(await pending);
    } catch (error) {
        columnCache.delete(tableName);
        throw error;
    }
}

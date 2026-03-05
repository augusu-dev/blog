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

    const pending = prisma
        .$queryRawUnsafe<ColumnRow[]>(
            `
                SELECT "column_name"
                FROM "information_schema"."columns"
                WHERE "table_schema" = current_schema()
                  AND "table_name" = $1
            `,
            tableName
        )
        .then((rows) => new Set(rows.map((row) => String(row.column_name))));

    columnCache.set(tableName, pending);

    try {
        return new Set(await pending);
    } catch (error) {
        columnCache.delete(tableName);
        throw error;
    }
}

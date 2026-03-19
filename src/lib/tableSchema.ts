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
        try {
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
        } catch {
            // Fall through to less strict catalog lookups.
        }

        try {
            const catalogRows = await prisma.$queryRawUnsafe<ColumnRow[]>(
                `
                    SELECT DISTINCT a.attname AS "column_name"
                    FROM pg_catalog.pg_attribute a
                    INNER JOIN pg_catalog.pg_class c
                        ON c.oid = a.attrelid
                    INNER JOIN pg_catalog.pg_namespace n
                        ON n.oid = c.relnamespace
                    WHERE c.relname = $1
                      AND a.attnum > 0
                      AND NOT a.attisdropped
                      AND (
                        n.nspname = ANY(current_schemas(false))
                        OR n.nspname = 'public'
                      )
                `,
                tableName
            );

            if (catalogRows.length > 0) {
                return new Set(catalogRows.map((row) => String(row.column_name)));
            }
        } catch {
            // Fall through to final information_schema scan.
        }

        try {
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
        } catch {
            return new Set<string>();
        }
    })();

    columnCache.set(tableName, pending);
    return new Set(await pending);
}

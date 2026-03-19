const SCHEMA_COMPATIBILITY_PATTERNS = [
    /unknown arg/i,
    /column .* does not exist/i,
    /relation .* does not exist/i,
    /permission denied/i,
    /must be owner/i,
];

const TRANSIENT_DATABASE_PATTERNS = [
    /MaxClientsInSessionMode/i,
    /max clients reached/i,
    /too many clients/i,
    /remaining connection slots are reserved/i,
    /timed out fetching a new connection from the connection pool/i,
    /connection pool timeout/i,
    /can'?t reach database server/i,
    /server closed the connection/i,
    /connection terminated unexpectedly/i,
];

function getPrismaErrorCode(error: unknown): string {
    if (!error || typeof error !== "object" || !("code" in error)) {
        return "";
    }

    return String((error as { code?: unknown }).code || "");
}

function getPrismaErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : "";
}

export function isSchemaCompatibilityError(error: unknown): boolean {
    const code = getPrismaErrorCode(error);
    if (code === "P2021" || code === "P2022") {
        return true;
    }

    const message = getPrismaErrorMessage(error);
    return SCHEMA_COMPATIBILITY_PATTERNS.some((pattern) => pattern.test(message));
}

export function isTransientDatabaseError(error: unknown): boolean {
    const code = getPrismaErrorCode(error);
    if (code === "P1001" || code === "P1008" || code === "P1017" || code === "P2024") {
        return true;
    }

    const message = getPrismaErrorMessage(error);
    return TRANSIENT_DATABASE_PATTERNS.some((pattern) => pattern.test(message));
}

export function isRecoverableReadError(error: unknown): boolean {
    return isSchemaCompatibilityError(error) || isTransientDatabaseError(error);
}

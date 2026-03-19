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

export async function retryTransientRead<T>(
    loader: () => Promise<T>,
    options?: { attempts?: number; delayMs?: number }
): Promise<T> {
    const attempts = Math.max(1, options?.attempts ?? 2);
    const delayMs = Math.max(0, options?.delayMs ?? 200);

    for (let attempt = 0; attempt < attempts; attempt += 1) {
        try {
            return await loader();
        } catch (error) {
            if (!isTransientDatabaseError(error) || attempt === attempts - 1) {
                throw error;
            }

            if (delayMs > 0) {
                await new Promise((resolve) => setTimeout(resolve, delayMs * (attempt + 1)));
            }
        }
    }

    throw new Error("retryTransientRead exhausted without returning or throwing");
}

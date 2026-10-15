// The database URL is assembled from parts so there is exactly one source of
// truth. POSTGRES_HOST is what differs per environment: `localhost` from the
// host machine, `postgres` (the compose service) from inside the backend
// container.

function required(name: string): string {
    const value = process.env[name];
    if (!value) throw new Error(`Missing required environment variable: ${name}`);
    return value;
}

export function buildDatabaseUrl(): string {
    const user = encodeURIComponent(required("POSTGRES_USER"));
    const password = encodeURIComponent(required("POSTGRES_PASSWORD"));
    const database = encodeURIComponent(required("POSTGRES_DB"));
    const host = required("POSTGRES_HOST");
    const port = required("POSTGRES_PORT");

    return `postgresql://${user}:${password}@${host}:${port}/${database}`;
}

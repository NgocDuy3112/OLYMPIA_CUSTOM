export function deriveTestDatabaseUrl(devUrl: string | undefined): string {
    if (!devUrl) {
        throw new Error("DATABASE_URL is not set — refusing to run tests.");
    }

    const testUrl = devUrl.replace(/\/[^/?]+$/, "/olympia_test");

    if (!testUrl.includes("test") || testUrl === devUrl) {
        throw new Error(
            "Derived test URL is unsafe — refusing to destroy a non-test database."
        );
    }

    return testUrl;
}

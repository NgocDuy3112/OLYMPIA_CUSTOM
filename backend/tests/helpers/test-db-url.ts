export const TEST_DATABASE_NAME = "olympia_test";

export function assertTestDatabaseUrl(url: string): void {
    const name = url.split("/").pop()?.split("?")[0];
    if (name !== TEST_DATABASE_NAME) {
        throw new Error(
            `Refusing to run tests against "${name}" — expected the test database "${TEST_DATABASE_NAME}".`
        );
    }
}

export function deriveTestDatabaseUrl(devUrl: string | undefined): string {
    if (!devUrl) {
        throw new Error("Database URL is not set — refusing to run tests.");
    }

    const testUrl = devUrl.replace(/\/[^/?]+$/, `/${TEST_DATABASE_NAME}`);

    assertTestDatabaseUrl(testUrl);
    if (testUrl === devUrl) {
        throw new Error("Derived test URL equals the dev URL — refusing to run tests.");
    }

    return testUrl;
}

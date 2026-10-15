import { FormatRegistry } from "@sinclair/typebox";

const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

FormatRegistry.Set("date-time", (value) =>
    DATE_TIME.test(value) && !Number.isNaN(Date.parse(value))
);

FormatRegistry.Set("uuid", (value) => UUID.test(value));

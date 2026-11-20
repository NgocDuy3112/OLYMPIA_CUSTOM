namespace AOC.Api.Http;

public sealed class PaginationError(string message) : Exception(message);

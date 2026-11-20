namespace AOC.Api.Http;

public sealed record PageResult<T>(List<T> Items, int Total, int Limit, int Offset);

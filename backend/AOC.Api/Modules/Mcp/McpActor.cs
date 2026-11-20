namespace AOC.Api.Modules.Mcp;

public sealed record McpActor(Guid KeyId, List<string> Scopes, Guid? UserId, string? Role);

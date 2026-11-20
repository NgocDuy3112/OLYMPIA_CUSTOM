namespace AOC.Infrastructure.Auth;

public sealed record SessionTokenPayload(string Sub, string Role, int TokenVersion);

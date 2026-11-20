namespace AOC.Infrastructure.Auth;

public sealed record PendingMfaToken(string Sub, string Purpose);

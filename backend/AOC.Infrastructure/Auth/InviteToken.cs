namespace AOC.Infrastructure.Auth;

public sealed record InviteToken(string Sub, int TokenVersion, string Purpose);

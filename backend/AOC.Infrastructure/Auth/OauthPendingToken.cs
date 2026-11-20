namespace AOC.Infrastructure.Auth;

public sealed record OauthPendingToken(string State, string Nonce, string CodeVerifier, string Purpose, string? Next);

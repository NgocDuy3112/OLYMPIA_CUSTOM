namespace AOC.Api.Shared;

public sealed record PublicUser(
    Guid Id,
    string? Username,
    string DisplayName,
    string Role,
    bool EmailVerified,
    bool TotpEnabled,
    string? AvatarUrl
);

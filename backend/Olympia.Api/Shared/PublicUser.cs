using Olympia.Infrastructure.Data.Entities;

namespace Olympia.Api.Shared;

public sealed record PublicUser(
    Guid Id,
    string? Username,
    string DisplayName,
    string Role,
    bool EmailVerified,
    bool TotpEnabled,
    string? AvatarUrl
);

/// <summary>Port of lib/public-user.ts.</summary>
public static class PublicUsers
{
    public static PublicUser Of(UserEntity user) => new(
        user.Id,
        user.Username,
        user.DisplayName,
        user.Role.ToString(),
        user.EmailVerified,
        user.TotpEnabledAt is not null,
        user.AvatarUrl);
}

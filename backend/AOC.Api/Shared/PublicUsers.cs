using AOC.Infrastructure.Data.Entities;

namespace AOC.Api.Shared;

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

using AOC.Infrastructure.Data;
using AOC.Infrastructure.Data.Entities;

namespace AOC.Api.Shared;

/// <summary>Port of lib/tournament-access.ts.</summary>
public static class TournamentAccess
{
    public static bool CanView(TournamentEntity row, UserEntity user)
    {
        if (row.Visibility == Visibility.PUBLIC) return true;
        return user.Role == UserRole.ADMIN;
    }

    public static bool CanWrite(TournamentEntity row, UserEntity user)
    {
        if (user.Role == UserRole.ADMIN) return true;
        return row.Visibility == Visibility.PUBLIC && row.OwnerId == user.Id;
    }
}
